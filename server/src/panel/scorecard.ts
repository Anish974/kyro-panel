import {
  COMPETENCIES,
  PANEL,
  type CompetencyId,
  type PanelistId,
  type PanelistVerdict,
  type Scorecard,
  type Verdict,
} from '@kyro/shared';
import { SIGNALS } from './personas.js';
import { getModel } from './model.js';
import { writeVerdicts } from './verdicts.js';

// The artefact the hiring team actually reads. Three separate verdicts built
// from the same shared model — never averaged, because the disagreement is the
// product. Every rationale points at a quote the candidate really said.
//
// ponytail: verdicts are derived from the competency scores the panel already
// moved during the interview. Swap buildVerdict for one LLM call per panelist
// when LLM_API_KEY is set — the return shape does not change.

/** What each panelist grades on, and how much each part counts. Sums to 1. */
const WEIGHTS: Record<PanelistId, Partial<Record<CompetencyId, number>>> = {
  technical: { systemDesign: 0.5, tradeoffReasoning: 0.3, communication: 0.2 },
  product: { customerImpact: 0.5, tradeoffReasoning: 0.3, communication: 0.2 },
  hr: { ownership: 0.5, communication: 0.3, tradeoffReasoning: 0.2 },
};

function verdictFor(score: number): Verdict {
  if (score >= 3.75) return 'hire';
  if (score >= 3) return 'lean_hire';
  if (score >= 2.25) return 'lean_no_hire';
  return 'no_hire';
}

function buildVerdict(id: PanelistId): PanelistVerdict {
  const model = getModel();
  const weights = WEIGHTS[id];
  const entries = Object.entries(weights) as [CompetencyId, number][];

  const ratings: Partial<Record<CompetencyId, number>> = {};
  for (const [competency] of entries) {
    ratings[competency] = Math.round(model.skills[competency] * 5 * 10) / 10;
  }

  const score =
    Math.round(entries.reduce((sum, [c, w]) => sum + model.skills[c] * w, 0) * 5 * 10) / 10;

  // Only what the candidate said counts as evidence — never the panel's own words.
  const quote = (t: { text: string; t: number }) => ({
    quote: t.text.length > 180 ? t.text.slice(0, 177) + '…' : t.text,
    t: t.t,
  });

  const onMyAxis = model.transcript.filter(
    t => t.speaker === 'candidate' && SIGNALS[id].test(t.text),
  );

  // A panelist whose keywords never came up would otherwise write a verdict
  // citing nothing. What they actually reacted to is the answer immediately
  // before each of their own turns, so fall back to that.
  const answered = model.transcript.filter(
    (t, i) =>
      t.speaker === 'candidate' &&
      t.text.trim() !== '' &&
      model.transcript[i + 1]?.speaker === id,
  );

  const evidence = (onMyAxis.length ? onMyAxis : answered).slice(-2).map(quote);

  // The weakest thing this panelist grades on is what they write up.
  const weakest = entries.reduce((a, b) => (model.skills[a[0]] <= model.skills[b[0]] ? a : b))[0];
  const gap = model.gaps.length ? ` Open with the panel: ${model.gaps[0]}.` : '';
  const rationale = evidence.length
    ? `${COMPETENCIES[weakest]} was the weakest part of what I heard (${ratings[weakest]}/5).${gap}`
    : model.turns === 0
      ? `Interview concluded early before candidate responses were recorded. Insufficient data to evaluate.`
      : `Limited candidate responses on this domain during the session (${model.turns} turns completed). Confidence is low.${gap}`;

  return {
    panelist: id,
    verdict: verdictFor(score),
    score,
    // Confidence is evidence-bound: no quotes, no confidence.
    confidence: model.turns === 0 ? 0.2 : Math.min(0.35 + evidence.length * 0.2 + model.turns * 0.03, 0.95),
    rationale,
    evidence,
    ratings,
  };
}

const HIRE_SIDE = (v: Verdict): boolean => v === 'hire' || v === 'lean_hire';

/**
 * The finished scorecard.
 *
 * Async because the three write-ups are one LLM call reading the transcript —
 * see verdicts.ts for why the templated version was not good enough. The call
 * degrades to the tracked-score version rather than failing, so this always
 * resolves to a usable card.
 */
export async function buildScorecard(
  candidateName = 'Candidate',
  role = 'Senior Backend Engineer',
  level?: string,
  customDuration?: number,
): Promise<Scorecard> {
  const model = getModel();
  const currentLevel = level || model.profile?.level || 'Intermediate (2-6 years)';
  const durationSec = typeof customDuration === 'number' && customDuration >= 0
    ? customDuration
    : model.elapsed;

  // Written after the duration is settled, so the panel's write-up and the
  // number on the card agree about how long the interview actually ran.
  const verdicts = await writeVerdicts(PANEL.map(p => buildVerdict(p.id)), durationSec);

  return {
    sessionId: model.sessionId,
    role,
    level: currentLevel,
    candidateName,
    durationSec,
    verdicts,
    claims: model.claims,
    dissent: new Set(verdicts.map(v => HIRE_SIDE(v.verdict))).size > 1,
    timestamp: Date.now(),
    turns: model.turns,
  };
}
