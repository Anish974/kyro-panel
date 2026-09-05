import {
  PROFILE_LIMITS,
  emptyModel,
  type CandidateModel,
  type CandidateProfile,
  type Claim,
  type CompetencyId,
  type PanelistId,
  type Scenario,
  type Scorecard,
  type TranscriptTurn,
} from '@kyro/shared';

// One session in memory. This is why the server must be long-running and must
// not be deployed to a serverless platform — a cold start loses the interview.
//
// ponytail: single in-memory session, fine for the demo. Move to a Map keyed by
// sessionId when more than one interview runs at a time, and to Redis only if
// the server ever needs to scale past one process.

let model: CandidateModel = emptyModel(`s-${Date.now()}`);
// Reset with the model, not once at import — otherwise every timestamp after a
// /reset is measured from server start, and a fresh demo opens at 14 minutes.
let startedAt = Date.now();

// In-memory history of completed candidate scorecards for company / recruiter portal
let scorecardsHistory: Scorecard[] = [
  {
    sessionId: 'hist-1',
    candidateName: 'Vikram Malhotra',
    role: 'Senior Backend Engineer',
    level: 'Expert (6-11+ years)',
    durationSec: 685,
    timestamp: Date.now() - 3600 * 1000 * 3,
    turns: 10,
    dissent: false,
    verdicts: [
      {
        panelist: 'technical',
        verdict: 'hire',
        score: 4.6,
        confidence: 0.94,
        rationale: 'Exceptional mastery of high-throughput distributed caching, Raft consensus, and failure-domain partitioning.',
        evidence: [{ quote: 'We partitioned the keyspace across 64 shards using consistent hashing with virtual nodes.', t: 210 }],
        ratings: { systemDesign: 4.8, tradeoffReasoning: 4.5, communication: 4.5 },
      },
      {
        panelist: 'product',
        verdict: 'hire',
        score: 4.3,
        confidence: 0.9,
        rationale: 'Strong grasp of p99 SLA impacts on buyer checkout conversion rates and degraded mode fallback.',
        evidence: [{ quote: 'We traded eventual consistency on recommendations to guarantee 50ms checkout latency SLAs.', t: 340 }],
        ratings: { customerImpact: 4.4, tradeoffReasoning: 4.3, communication: 4.2 },
      },
      {
        panelist: 'hr',
        verdict: 'hire',
        score: 4.5,
        confidence: 0.91,
        rationale: 'Demonstrated direct ownership over architectural migrations and mentored junior team leads during on-call incidents.',
        evidence: [{ quote: 'I set up the incident post-mortem cadence and led cross-functional blameless reviews.', t: 510 }],
        ratings: { ownership: 4.7, communication: 4.5, tradeoffReasoning: 4.3 },
      },
    ],
    claims: [
      { id: 'c1', text: 'Scaled payment ingress pipeline to 35k RPS at 99.99% availability.', t: 180, status: 'verified' },
      { id: 'c2', text: 'Migrated legacy monolith to Kubernetes with zero customer downtime.', t: 420, status: 'verified' },
    ],
  },
  {
    sessionId: 'hist-2',
    candidateName: 'Priya Sharma',
    role: 'Full-Stack Engineer',
    level: 'Intermediate (2-6 years)',
    durationSec: 610,
    timestamp: Date.now() - 3600 * 1000 * 8,
    turns: 9,
    dissent: true,
    verdicts: [
      {
        panelist: 'technical',
        verdict: 'lean_hire',
        score: 3.7,
        confidence: 0.85,
        rationale: 'Clean component architecture and solid Next.js/SSR hydration optimization, but light on DB indexing internals.',
        evidence: [{ quote: 'We implemented optimistic UI updates with rollback states on network failures.', t: 195 }],
        ratings: { systemDesign: 3.6, tradeoffReasoning: 3.8, communication: 4.0 },
      },
      {
        panelist: 'product',
        verdict: 'hire',
        score: 4.2,
        confidence: 0.88,
        rationale: 'Very thoughtful regarding user onboarding drop-off metrics and iterative A/B experimentation.',
        evidence: [{ quote: 'We ran 3 cohort experiments to measure time-to-first-action and improved conversion by 14%.', t: 320 }],
        ratings: { customerImpact: 4.5, tradeoffReasoning: 4.0, communication: 4.1 },
      },
      {
        panelist: 'hr',
        verdict: 'lean_hire',
        score: 3.8,
        confidence: 0.82,
        rationale: 'Proactive collaborator with design and QA teams. Good examples of constructive feedback.',
        evidence: [{ quote: 'Coordinated directly with design system maintainers to standardize our token library.', t: 460 }],
        ratings: { ownership: 3.9, communication: 4.1, tradeoffReasoning: 3.6 },
      },
    ],
    claims: [
      { id: 'c1', text: 'Built real-time collaborative workspace canvas using WebSockets.', t: 160, status: 'verified' },
    ],
  },
  {
    sessionId: 'hist-3',
    candidateName: 'Aarav Patel',
    role: 'Frontend Engineer',
    level: 'Beginner (0-2 years)',
    durationSec: 540,
    timestamp: Date.now() - 3600 * 1000 * 24,
    turns: 8,
    dissent: false,
    verdicts: [
      {
        panelist: 'technical',
        verdict: 'lean_hire',
        score: 3.4,
        confidence: 0.8,
        rationale: 'Good foundation in React hooks, state management, and CSS layout. Learning curiosity is very strong.',
        evidence: [{ quote: 'I profiled re-renders using React DevTools and memoized expensive graph calculations.', t: 215 }],
        ratings: { systemDesign: 3.3, tradeoffReasoning: 3.4, communication: 3.6 },
      },
      {
        panelist: 'product',
        verdict: 'lean_hire',
        score: 3.5,
        confidence: 0.78,
        rationale: 'Understands basic web accessibility guidelines (WCAG) and responsive mobile viewport requirements.',
        evidence: [{ quote: 'Ensured keyboard navigability and high contrast compliance across all checkout inputs.', t: 330 }],
        ratings: { customerImpact: 3.6, tradeoffReasoning: 3.3, communication: 3.5 },
      },
      {
        panelist: 'hr',
        verdict: 'hire',
        score: 4.0,
        confidence: 0.86,
        rationale: 'High enthusiasm, receptive to mentorship, and transparent about areas where they sought senior engineering guidance.',
        evidence: [{ quote: 'I asked for pair programming sessions to understand our state machine architecture.', t: 440 }],
        ratings: { ownership: 3.8, communication: 4.2, tradeoffReasoning: 3.5 },
      },
    ],
    claims: [
      { id: 'c1', text: 'Redesigned component library reducing bundle size by 28%.', t: 140, status: 'verified' },
    ],
  },
];

export const getModel = (): CandidateModel => ({
  ...model,
  elapsed: Math.floor((Date.now() - startedAt) / 1000),
});

/**
 * Wipes the interview. The profile survives by default — it is who is sitting
 * in the room, not something they said, and a re-run of the same demo should
 * not make the panel forget the candidate's name. Pass true to clear it too.
 */
export function reset(forgetProfile = false): void {
  model = emptyModel(`s-${Date.now()}`, forgetProfile ? null : model.profile);
  startedAt = Date.now();
}

/**
 * Trust boundary: everything here is typed by whoever posted to /candidate.
 * Coerce to string, strip control characters (they break the SSE framing and
 * the prompt alike) and cap every field before it reaches an LLM prompt.
 */
export function setProfile(raw: unknown): CandidateProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;

  // Keep tab and newline, drop every other control character: they break the
  // SSE framing on the way back out to the room UI. Written as a filter rather
  // than a regex so no raw control byte ends up in this source file.
  const printable = (ch: string): boolean => ch >= ' ' || ch === '\n' || ch === '\t';
  const clean = (value: unknown, max: number): string =>
    typeof value === 'string'
      ? Array.from(value).filter(printable).join('').slice(0, max).trim()
      : '';
  /** Collapsed to one line — these fields get spoken aloud and printed in the UI. */
  const line = (value: unknown, max: number): string =>
    clean(value, max).replace(/\s+/g, ' ').trim();

  const name = line(input.name, PROFILE_LIMITS.name);
  const role = line(input.role, PROFILE_LIMITS.role);
  if (!name || !role) return null;

  const level = line(input.level, PROFILE_LIMITS.level) || 'Intermediate (2-6 years)';
  const email = line(input.email, PROFILE_LIMITS.email);
  const resumeText = clean(input.resumeText, PROFILE_LIMITS.resumeText).replace(/\n{3,}/g, '\n\n');

  model.profile = {
    name,
    role,
    level,
    ...(email ? { email } : {}),
    ...(resumeText ? { resumeText } : {}),
  };

  // Calibrate initial starting difficulty based on the candidate's declared experience level
  if (level.includes('Intern')) {
    model.difficulty = 1;
  } else if (level.includes('Beginner')) {
    model.difficulty = 2;
  } else if (level.includes('Intermediate')) {
    model.difficulty = 3;
  } else if (level.includes('Expert')) {
    model.difficulty = 4;
  }

  return model.profile;
}

export const profile = (): CandidateProfile | null => model.profile;

export function addTurn(turn: Omit<TranscriptTurn, 't'>): void {
  model.transcript.push({ ...turn, t: getModel().elapsed });
  if (turn.speaker === 'candidate') model.turns++;
  else model.lastSpeaker = turn.speaker;
}

export const hasGap = (gap: string): boolean => model.gaps.includes(gap);

export function addGap(gap: string): void {
  if (!model.gaps.includes(gap)) model.gaps.push(gap);
}

export function addClaim(claim: Omit<Claim, 'id' | 't'>): Claim {
  const full: Claim = { ...claim, id: `c${model.claims.length + 1}`, t: getModel().elapsed };
  model.claims.push(full);
  return full;
}

export function updateClaim(id: string, patch: Partial<Claim>): Claim | null {
  const claim = model.claims.find(c => c.id === id);
  if (!claim) return null;
  Object.assign(claim, patch);
  return claim;
}

/** Opens a role-play. Refuses if one is already running — one at a time. */
export function openScenario(premise: string, openedBy: PanelistId): Scenario | null {
  if (model.scenario) return null;
  model.scenario = { premise, openedBy, t: getModel().elapsed, turns: 0 };
  return model.scenario;
}

export function closeScenario(): void {
  model.scenario = null;
}

/** Counts one candidate answer given inside the running role-play. */
export function advanceScenario(): void {
  if (model.scenario) model.scenario.turns++;
}

export const scenario = (): Scenario | null => model.scenario;

/** Nudge a competency toward `target`. Scores move, they do not jump. */
export function nudgeSkill(id: CompetencyId, target: number, weight = 0.35): void {
  const current = model.skills[id];
  model.skills[id] = Math.round((current + (target - current) * weight) * 100) / 100;
}

/** Difficulty follows demonstrated competence, clamped to 1..5. */
export function adjustDifficulty(delta: number): void {
  model.difficulty = Math.max(1, Math.min(5, model.difficulty + delta));
}

export const lastSpeaker = (): PanelistId | null => model.lastSpeaker;

export function saveScorecardToHistory(scorecard: Scorecard): void {
  const idx = scorecardsHistory.findIndex(s => s.sessionId === scorecard.sessionId);
  if (idx >= 0) {
    scorecardsHistory[idx] = scorecard;
  } else {
    scorecardsHistory.unshift(scorecard);
  }
}

export function getScorecardsHistory(): Scorecard[] {
  return scorecardsHistory;
}
