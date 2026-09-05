import {
  PROFILE_LIMITS,
  emptyModel,
  type CandidateModel,
  type CandidateProfile,
  type Claim,
  type CompetencyId,
  type PanelistId,
  type Scenario,
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

  const email = line(input.email, PROFILE_LIMITS.email);
  const resumeText = clean(input.resumeText, PROFILE_LIMITS.resumeText).replace(/\n{3,}/g, '\n\n');

  model.profile = {
    name,
    role,
    ...(email ? { email } : {}),
    ...(resumeText ? { resumeText } : {}),
  };
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
