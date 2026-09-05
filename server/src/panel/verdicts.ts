import {
  COMPETENCIES,
  PANEL,
  type CompetencyId,
  type PanelistId,
  type PanelistVerdict,
  type Verdict,
} from '@kyro/shared';
import { LLM_ENABLED, ask, parseJson } from './llm.js';
import { getModel } from './model.js';

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
 * Ten questions is a full interview and earns the normal 0.95 ceiling. Four
 * answers is a fragment, and a verdict written off a fragment must say so in
 * the number, not just in the prose.
 */
function confidenceCeiling(): number {
  const turns = getModel().turns;
  if (turns >= 8) return 0.95;
  if (turns >= 5) return 0.75;
  if (turns >= 3) return 0.6;
  return 0.4;
}

function coerce(fallback: PanelistVerdict, raw: RawVerdict | undefined, lines: { text: string; t: number }[]): PanelistVerdict {
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
    confidence: evidence.length
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
- verdict is one of: hire, lean_hire, lean_no_hire, no_hire. score is 0.0-5.0.
- The reference score is what the panel tracked live during the interview. Treat it as a prior, not an instruction — move off it when the transcript justifies it.

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
  const skills = (Object.keys(COMPETENCIES) as CompetencyId[])
    .map(c => `${COMPETENCIES[c]} ${m.skills[c].toFixed(2)}`)
    .join(', ');

  // Minutes, and the same number the card will show. Handed seconds, the model
  // narrates them — "the interview lasted only 6 seconds" — and the card was
  // reporting a different figure anyway, because the room measures the real
  // speaking time while the model's clock starts when the agent joins.
  const minutes = Math.max(1, Math.round(durationSec / 60));

  return [
    `Candidate: ${m.profile?.name ?? 'unknown'} — ${m.profile?.role ?? 'unknown role'}${m.profile?.level ? ` (${m.profile.level})` : ''}`,
    `Questions answered: ${m.turns} of a target 10, over about ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    `Competency scores the panel tracked live (0-1): ${skills}`,
    `Gaps the panel noted: ${m.gaps.length ? m.gaps.join('; ') : 'none'}`,
    `Reference scores out of 5: ${fallbacks.map(f => `${f.panelist} ${f.score}`).join(', ')}`,
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
    return PANEL.map(p => coerce(byId.get(p.id)!, raw[p.id], lines));
  } catch (err) {
    // A failed write-up must not cost the hiring team the scorecard. The
    // arithmetic verdicts are thinner, not wrong.
    console.warn('[verdicts] LLM write-up failed, keeping the tracked scores:', (err as Error).message);
    return fallbacks;
  }
}
