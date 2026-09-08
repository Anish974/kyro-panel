import {
  COMPETENCIES,
  PANEL,
  type CompetencyId,
  type PanelistId,
  type PanelistVerdict,
  type Verdict,
} from '@kyro/shared';
import { LLM_ENABLED, ask, parseJson } from './llm.js';
import { concludeAtTurn, getModel } from './model.js';

// What the three panelists actually write up at the end.
//
// The arithmetic version in scorecard.ts derives a verdict from the competency
// scores the panel nudged during the interview, and fills the rationale from a
// template: "System design was the weakest part of what I heard (2.8/5)."
// Every interview produced the same sentence with a different noun in it. For a
// product whose whole claim is evidence-linked feedback and a panel that
// genuinely disagrees, that was the weakest thing on the page.
//
// So: one LLM call at the end, reading the real transcript, writing three
// separate write-ups. The numbers the panel already tracked go in as an anchor
// rather than being thrown away, and every quote is checked against what the
// candidate really said before it reaches the page.

const VERDICTS: readonly Verdict[] = ['hire', 'lean_hire', 'lean_no_hire', 'no_hire'];

/** Big enough for three rationales with evidence, small enough to stay quick. */
const MAX_TOKENS = 1200;

interface RawVerdict {
  verdict?: string;
  score?: number;
  confidence?: number;
  rationale?: string;
  ratings?: Record<string, unknown>;
  evidence?: { quote?: string }[];
}

/**
 * Keeps only the competencies this panelist actually grades.
 *
 * The arithmetic fallback already decided which three those are, so its keys
 * are the whitelist: a model that volunteers a mark for something outside its
 * own axis is answering a question nobody asked, and the competency matrix in
 * the UI is laid out from these keys.
 */
function coerceRatings(
  raw: Record<string, unknown> | undefined,
  fallback: Partial<Record<CompetencyId, number>>,
): Partial<Record<CompetencyId, number>> {
  if (!raw || typeof raw !== 'object') return fallback;

  const out: Partial<Record<CompetencyId, number>> = {};
  for (const key of Object.keys(fallback) as CompetencyId[]) {
    const n = Number(raw[key]);
    out[key] = Number.isFinite(n) && n >= 0 && n <= 5
      ? Math.round(n * 10) / 10
      : fallback[key];
  }
  return out;
}

type RawVerdicts = Partial<Record<PanelistId, RawVerdict>>;

/**
 * How many questions each panelist actually put to the candidate.
 *
 * The bidding is supposed to move the floor around. When it does not, one
 * panelist can take eight of ten turns and another can take none — and the one
 * who took none was still writing "impact and problem-solving were entirely
 * absent" and scoring 1.0, on an axis they never once asked about. That is not
 * a finding about the candidate.
 */
function questionsAsked(): Record<PanelistId, number> {
  const asked = Object.fromEntries(PANEL.map(p => [p.id, 0])) as Record<PanelistId, number>;
  for (const turn of getModel().transcript) {
    if (turn.speaker !== 'candidate') asked[turn.speaker] += 1;
  }
  return asked;
}

/** Everything the candidate actually said, with the time it was said. */
function candidateLines(): { text: string; t: number }[] {
  return getModel().transcript.filter(t => t.speaker === 'candidate' && t.text.trim() !== '');
}

/** Loose comparison — the model will re-punctuate and re-case what it quotes. */
const normalise = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Keeps only quotes the candidate really said.
 *
 * A model asked for supporting quotes will happily produce a plausible one that
 * was never uttered, and a fabricated quote on a hiring document is the worst
 * thing this product could ship. Each returned quote has to appear inside one
 * of the candidate's own turns; the timestamp then comes from that turn, not
 * from the model.
 */
function verifyEvidence(raw: RawVerdict['evidence'], lines: { text: string; t: number }[]): { quote: string; t: number }[] {
  if (!Array.isArray(raw)) return [];
  const out: { quote: string; t: number }[] = [];

  for (const item of raw.slice(0, 3)) {
    const quote = typeof item?.quote === 'string' ? item.quote.trim() : '';
    if (quote.length < 12) continue;

    const needle = normalise(quote);
    const source = lines.find(l => normalise(l.text).includes(needle));
    if (!source) {
      console.warn(`[verdicts] dropped an unverifiable quote: "${quote.slice(0, 60)}…"`);
      continue;
    }
    out.push({ quote: quote.length > 180 ? quote.slice(0, 177) + '…' : quote, t: source.t });
  }
  return out;
}

/**
 * How sure any panelist is allowed to be, given how much they actually heard.
 *
 * A full interview earns the normal 0.95 ceiling. A fragment does not, and a
 * verdict written off a fragment must say so in the number, not just in the
 * prose.
 *
 * Measured as a SHARE of what was booked, not as an absolute turn count. Five
 * answers is most of a five-minute screen and barely half of a fifteen-minute
 * interview; scoring both at 0.75 would call a completed screen unreliable and
 * a half-abandoned interview solid. The fractions below reproduce the old
 * thresholds exactly on a ten-turn budget, which is what every interview before
 * this feature was.
 *
 * Exported because scorecard.ts's arithmetic verdicts have to obey the very
 * same ceiling. They did not, and the result was backwards: a failed LLM
 * write-up produced 0.9 confidence off five turns while a successful one was
 * held to 0.75 on the same interview.
 */
export function confidenceCeiling(): number {
  const share = getModel().turns / Math.max(1, concludeAtTurn());
  if (share >= 0.8) return 0.95;
  if (share >= 0.5) return 0.75;
  if (share >= 0.3) return 0.6;
  return 0.4;
}

function coerce(
  fallback: PanelistVerdict,
  raw: RawVerdict | undefined,
  lines: { text: string; t: number }[],
  asked: number,
): PanelistVerdict {
  if (!raw?.rationale) return fallback;

  const evidence = verifyEvidence(raw.evidence, lines);
  const score = Number.isFinite(Number(raw.score))
    ? Math.max(0, Math.min(5, Math.round(Number(raw.score) * 10) / 10))
    : fallback.score;

  return {
    ...fallback,
    verdict: (VERDICTS as readonly string[]).includes(raw.verdict ?? '')
      ? (raw.verdict as Verdict)
      : fallback.verdict,
    score,
    // Confidence stays evidence-bound and turn-bound, never whatever the model
    // claims about itself. Asked to self-rate, it returned 0.95 off four
    // answers — no panelist is that sure after four questions, and on a hiring
    // document an overstated confidence is worse than a low one.
    // A panelist who never asked anything cannot be confident about an answer
    // they never heard. The prompt asks them to say so; this makes the number
    // say so too, whatever they wrote.
    confidence: asked === 0
      ? Math.min(fallback.confidence, 0.2)
      : evidence.length
        ? Math.max(0, Math.min(confidenceCeiling(), Number(raw.confidence) || fallback.confidence))
        : Math.min(fallback.confidence, 0.4),
    rationale: String(raw.rationale).slice(0, 600),
    ratings: coerceRatings(raw.ratings, fallback.ratings),
    evidence: evidence.length ? evidence : fallback.evidence,
  };
}

const PROMPT = `You are writing up a completed three-person interview panel. The interview is over; the candidate has left. Each panelist now writes their own independent verdict.

ARJUN MEHTA — technical architect. Grades technicalDepth, problemSolving, communication.
ANANYA SHAH — product manager. Grades impact, problemSolving, communication.
ROHAN IYER — hiring manager. Grades ownership, communication, problemSolving.

RULES:
- Write as that person, in first person, about THIS candidate. Two to four sentences. Say what you actually saw — the specific system, decision or number they described. No generic HR language, no "demonstrated strong skills".
- The three of you reached your own conclusions. If you disagree with where another panelist would land, that is the point: do not converge.
- "evidence" must quote the candidate VERBATIM from the transcript below. Copy the words exactly. Never invent, paraphrase or compose a quote — an unverifiable quote is dropped and your verdict loses its confidence.
- You MAY describe how they communicated — hedging, vagueness, over-claiming, hiding "I" inside "we", answering a different question than the one asked. Say it plainly. But anchor it: name the phrasing that shows it. "Hedged — said 'I think we maybe reduced it' and never gave a number" is a finding. "Seemed nervous" is not, because you have a text transcript and cannot see or hear them.
- Do not invent exchanges. If you write that they were pressed on something, that question must appear in the transcript below.
- Justify the number. Your rationale must say what would have moved the score up, or what kept it down. A score with no reason attached is not a verdict.
- "ratings" are your own marks out of 5 on the competencies you grade, each one defensible from the transcript.
- If the interview was too short or never touched your axis, say so plainly and score low-confidence. Do not pad.
- AUDIO & CONNECTIVITY GLITCHES: If the candidate mentions audio or connectivity problems (e.g. "you are not audible", "I cannot hear you", "sir you are not audible", "voice is breaking", or asks to repeat), these are real WebRTC audio glitches, NEVER candidate evasiveness. Under NO circumstances should you penalize a candidate, lower communication ratings, or criticize them for "false audio complaints" or "defensive claims". Judge strictly the technical, product, and leadership substance of the questions they answered.
- verdict is one of: hire, lean_hire, lean_no_hire, no_hire. score is 0.0-5.0.
- BASE YOUR SCORE DIRECTLY ON QUESTIONS ASKED & TOPIC RELEVANCE:
  * Count the questions YOU actually asked the candidate from the transcript below.
  * For each question you asked, evaluate if the candidate answered what you asked directly and on-topic with real substance.
  * Score 3.75 - 5.0 (hire): Candidate answered all or almost all questions directly on-topic with deep substance, concrete decisions/metrics, and clear domain competence.
  * Score 3.0 - 3.7 (lean_hire): Candidate answered questions on-topic with solid understanding, though missing some depth or edge cases.
  * Score 2.0 - 2.9 (lean_no_hire): Answers were superficial, partially off-topic, or missed the core point of the questions asked.
  * Score 0.5 - 1.9 (no_hire): Candidate dodged questions, gave irrelevant/evasive non-answers, or demonstrated severe lack of competence on the topic asked.
  * Score 0.0 (no_hire): Zero questions asked or zero candidate responses on your axis. Confidence is 0.0.
  * CRITICAL: DO NOT default to 2.5 or any arbitrary middle score. Every score must be strictly justified by the ratio of questions asked vs how well and relevantly they were answered.

Answer with one JSON object, no prose around it. Use only the competency keys listed for that panelist:
{"technical": {"verdict": "...", "score": 0.0, "confidence": 0.0, "rationale": "...",
               "ratings": {"technicalDepth": 0.0, "problemSolving": 0.0, "communication": 0.0},
               "evidence": [{"quote": "..."}]},
 "product": {...}, "hr": {...}}`;

function transcriptBlock(): string {
  const m = getModel();
  if (!m.transcript.length) return '(the candidate never spoke)';
  return m.transcript
    .map(t => `[${t.t}s] ${t.speaker === 'candidate' ? 'CANDIDATE' : t.speaker.toUpperCase()}: ${t.text}`)
    .join('\n');
}

function referenceBlock(fallbacks: PanelistVerdict[], durationSec: number): string {
  const m = getModel();
  const asked = questionsAsked();
  const minutes = Math.max(1, Math.round(durationSec / 60));

  return [
    `Candidate: ${m.profile?.name ?? 'unknown'} — ${m.profile?.role ?? 'unknown role'}${m.profile?.level ? ` (${m.profile.level})` : ''}`,
    `Questions answered: ${m.turns} of a target ${concludeAtTurn()}, over about ${minutes} minute${minutes === 1 ? '' : 's'} of a ${m.durationMin}-minute interview.`,
    `Questions each of you actually asked: ${PANEL.map(p => `${p.id} ${asked[p.id]}`).join(', ')}.`,
    `Topic relevance scores calculated from transcript: ${fallbacks.map(f => `${f.panelist} ${f.score}/5.0`).join(', ')}.`,
    `Gaps the panel noted: ${m.gaps.length ? m.gaps.join('; ') : 'none'}`,
    '',
    'If you asked zero questions and the candidate never touched your axis, score 0.0 with 0.0 confidence.',
    'Grade each question on how directly and relevantly the candidate addressed your specific question.',
  ].join('\n');
}

/**
 * Rewrites the arithmetic verdicts as real write-ups.
 *
 * Returns the fallbacks untouched when there is no LLM key, when the call
 * fails, or when the candidate never actually spoke — a write-up invented for
 * an empty interview would be worse than an honest "nothing to assess".
 */
export async function writeVerdicts(fallbacks: PanelistVerdict[], durationSec: number): Promise<PanelistVerdict[]> {
  const lines = candidateLines();
  if (!LLM_ENABLED || lines.length === 0) return fallbacks;

  try {
    const user = [referenceBlock(fallbacks, durationSec), '', 'TRANSCRIPT:', transcriptBlock()].join('\n');
    const raw = parseJson<RawVerdicts>(await ask(PROMPT, user, MAX_TOKENS));
    if (!raw) throw new Error('no parsable JSON');

    const byId = new Map(fallbacks.map(f => [f.panelist, f]));
    const asked = questionsAsked();
    return PANEL.map(p => coerce(byId.get(p.id)!, raw[p.id], lines, asked[p.id]));
  } catch (err) {
    // A failed write-up must not cost the hiring team the scorecard. The
    // arithmetic verdicts are thinner, not wrong.
    console.warn('[verdicts] LLM write-up failed, keeping the tracked scores:', (err as Error).message);
    return fallbacks;
  }
}
