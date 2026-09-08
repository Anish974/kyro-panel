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
import { confidenceCeiling, writeVerdicts } from './verdicts.js';

// The artefact the hiring team actually reads. Three separate verdicts built
// from the same shared model — never averaged, because the disagreement is the
// product. Every rationale points at a quote the candidate really said.
//
// ponytail: verdicts are derived from the competency scores the panel already
// moved during the interview. Swap buildVerdict for one LLM call per panelist
// when LLM_API_KEY is set — the return shape does not change.

/** What each panelist grades on, and how much each part counts. Sums to 1. */
const WEIGHTS: Record<PanelistId, Partial<Record<CompetencyId, number>>> = {
  technical: { technicalDepth: 0.5, problemSolving: 0.3, communication: 0.2 },
  product: { impact: 0.5, problemSolving: 0.3, communication: 0.2 },
  hr: { ownership: 0.5, communication: 0.3, problemSolving: 0.2 },
};

export function verdictFor(score: number): Verdict {
  if (score >= 3.75) return 'hire';
  if (score >= 3) return 'lean_hire';
  if (score >= 2.0) return 'lean_no_hire';
  return 'no_hire';
}

/** Evaluates how relevant, complete, and on-topic a candidate response was for a panelist's axis. */
function answerTopicRelevance(panelist: PanelistId, text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) return 0;

  // Audio glitch complaints or short repeat queries carry no topic signal
  if (/\b(audible|hear you|voice is breaking|can't hear|cannot hear)\b/i.test(text) && words.length < 12) {
    return 0;
  }

  const matchesAxis = SIGNALS[panelist].test(text);

  if (panelist === 'technical') {
    if (!matchesAxis) return 0.1;
    const hasArchOrDeepTech =
      /\b(redis|kafka|postgres|mongo|sql|aws|docker|k8s|kubernetes|cloud|deploy|server|cluster|linux|network|infra|latenc|scale|shard|index|cache|queue|broker|api|replica|partition|concurrency|throughput|benchmark|protocol)\w*/i.test(
        text,
      );
    if (hasArchOrDeepTech && words.length >= 10) return 1.0;
    if (words.length >= 6) return 0.75;
    return 0.45;
  }

  if (panelist === 'product') {
    if (!matchesAxis) return 0.1;
    const hasImpactOrMetrics =
      /\b(user|customer|buyer|client|metric|impact|revenue|churn|conversion|retention|growth|feedback|adoption|outcome|business|sla)\w*/i.test(
        text,
      );
    if (hasImpactOrMetrics && words.length >= 10) return 1.0;
    if (words.length >= 6) return 0.75;
    return 0.45;
  }

  if (panelist === 'hr') {
    if (!matchesAxis) return 0.15;
    const hasOwnershipOrTeam =
      /\b(team|lead|mentor|disagree|pushback|stakeholder|colleague|decision|resolve|conflict|ownership|feedback|collaborat)\w*/i.test(
        text,
      );
    if (hasOwnershipOrTeam && words.length >= 10) return 1.0;
    if (words.length >= 6) return 0.75;
    return 0.45;
  }

  return 0.2;
}

function buildVerdict(id: PanelistId): PanelistVerdict {
  const model = getModel();
  const weights = WEIGHTS[id];
  const entries = Object.entries(weights) as [CompetencyId, number][];

  // If candidate never gave an answer or turns === 0: strictly no_hire with 0 score
  if (model.turns === 0) {
    const ratings: Partial<Record<CompetencyId, number>> = {};
    for (const [c] of entries) ratings[c] = 0;
    return {
      panelist: id,
      verdict: 'no_hire',
      score: 0,
      confidence: 0,
      rationale: 'Interview concluded early before candidate responses were recorded. Insufficient data to evaluate.',
      evidence: [],
      ratings,
    };
  }

  // Only what the candidate said counts as evidence — never the panel's own words.
  const quote = (t: { text: string; t: number }) => ({
    quote: t.text.length > 180 ? t.text.slice(0, 177) + '…' : t.text,
    t: t.t,
  });

  const questionsAsked = model.transcript.filter(
    (t, i) => t.speaker === id && model.transcript.slice(i + 1).some(next => next.speaker === 'candidate'),
  ).length;

  const directAnswers = model.transcript.filter(
    (t, i) =>
      t.speaker === 'candidate' &&
      t.text.trim() !== '' &&
      model.transcript[i - 1]?.speaker === id,
  );

  const answered = model.transcript.filter(
    (t, i) =>
      t.speaker === 'candidate' &&
      t.text.trim() !== '' &&
      model.transcript[i + 1]?.speaker === id,
  );

  const onMyAxis = model.transcript.filter(
    t => t.speaker === 'candidate' && t.text.trim() !== '' && SIGNALS[id].test(t.text),
  );

  // Pool all candidate turns that either answered this panelist directly or addressed this domain
  const relevantMap = new Map<number, (typeof model.transcript)[0]>();
  for (const t of directAnswers) relevantMap.set(t.t + (t.text.length), t);
  for (const t of onMyAxis) relevantMap.set(t.t + (t.text.length), t);
  if (relevantMap.size === 0) {
    for (const t of answered) relevantMap.set(t.t + (t.text.length), t);
  }
  const relevantTurns = Array.from(relevantMap.values());

  const evidence = (onMyAxis.length ? onMyAxis : answered).slice(-2).map(quote);

  // Score strictly derived from topic relevance of responses to questions asked
  let topicRatio = 0;
  if (relevantTurns.length > 0) {
    const sum = relevantTurns.reduce((acc, t) => acc + answerTopicRelevance(id, t.text), 0);
    const denom = Math.max(questionsAsked, relevantTurns.length, 1);
    topicRatio = Math.min(1.0, sum / denom);
  } else {
    topicRatio = 0;
  }

  const score = Math.round(topicRatio * 5.0 * 10) / 10;

  const allCandidate = model.transcript.filter(t => t.speaker === 'candidate' && t.text.trim() !== '');
  const hasProblemSolving = allCandidate.some(t =>
    /\b(because|why|instead|tradeoff|bottleneck|resolv|debug|constraint|trade-off)\w*/i.test(t.text),
  );
  const hasClearComm = allCandidate.every(t => t.text.trim().split(/\s+/).length >= 6);

  const ratings: Partial<Record<CompetencyId, number>> = {};
  for (const [competency] of entries) {
    if (competency === 'problemSolving') {
      const ps = hasProblemSolving ? Math.min(5.0, score + 0.3) : Math.max(0, score - 0.3);
      ratings[competency] = Math.round(ps * 10) / 10;
    } else if (competency === 'communication') {
      const comm = hasClearComm ? Math.min(5.0, score + 0.2) : Math.max(0, score - 0.4);
      ratings[competency] = Math.round(comm * 10) / 10;
    } else {
      ratings[competency] = score;
    }
  }

  const weakest = entries.reduce((a, b) => (ratings[a[0]]! <= ratings[b[0]]! ? a : b))[0];
  const gap = model.gaps.length ? ` Open with the panel: ${model.gaps[0]}.` : '';
  const rationale = questionsAsked === 0 && onMyAxis.length === 0
    ? 'I asked no questions on my axis during the session, so no signal was collected to evaluate this domain.'
    : evidence.length
      ? `${COMPETENCIES[weakest]} was the lowest-scoring area on my axis (${ratings[weakest]}/5). Topic relevance to questions asked was ${Math.round(topicRatio * 100)}%.${gap}`
      : `Limited candidate responses on this domain during the session (${model.turns} turns completed). Confidence is low.${gap}`;

  const raw = 0.2 + evidence.length * 0.2 + model.turns * 0.04;
  const confidence = questionsAsked === 0 && onMyAxis.length === 0
    ? 0.0
    : Math.min(raw, evidence.length ? confidenceCeiling() : 0.4);

  return {
    panelist: id,
    verdict: verdictFor(score),
    score,
    confidence,
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
  mock = false,
): Promise<Scorecard> {
  const model = getModel();
  const currentLevel = level || model.profile?.level || 'Intermediate (2-6 years)';
  // A zero-length interview is not a measurement, it is a room that did not
  // know how long it had been open. The room's own clock wins when it has one;
  // otherwise the session's, which has been running since the candidate joined.
  const durationSec =
    typeof customDuration === 'number' && customDuration > 0 ? customDuration : model.elapsed;

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
    mock,
    // The conversation itself, so a disputed verdict can be read back against
    // what was actually said rather than against the two lines it quoted.
    transcript: model.transcript,
  };
}
