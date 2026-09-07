import {
  DEFAULT_DURATION,
  PROFILE_LIMITS,
  asDuration,
  emptyModel,
  type CandidateModel,
  type CandidateProfile,
  type Claim,
  type CompetencyId,
  type PanelistId,
  type Scenario,
  type Duration,
  type Interview,
  type Scorecard,
  type TranscriptTurn,
} from '@kyro/shared';
import { continues } from './continuation.js';
import { query } from '../db/pool.js';
import { find as findInterview } from './interviews.js';

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

/**
 * Growing ASR finals the panel has sat through without answering, and whether
 * the closing has already been announced.
 *
 * Both belong to the session, so both die with it. `held` used to live in
 * routes/llm.ts and was never cleared by /reset — a session that ended
 * mid-continuation left the counter at its limit, and the first real answer of
 * the NEXT interview was swallowed as if it were more of the last one. On a
 * ten-turn budget that was one wasted question; on a five-turn screen it is a
 * fifth of the interview.
 */
let held = 0;
let concludedAnnounced = false;

/**
 * The candidate has just told us we misheard them.
 *
 * Consumed by the next turn's prompt and then cleared. Without it the denial
 * goes nowhere: routes/llm.ts answers a correction without running the panel,
 * so the panel would never learn that the thing it is asking about was never
 * said — and it asked a third time.
 */
let premiseDenied = false;

/**
 * The interview this session belongs to, resolved server-side from the code the
 * candidate joined with.
 *
 * This is the session's identity, and everything that used to be taken on trust
 * from the browser now comes off it: the role, the bar, the booked length, and
 * whether the result is hiring data. It is also the credential — /agent/start
 * and /scorecard both check the caller knows this code before they will spend
 * money or write a verdict.
 */
let sessionInterview: Interview | null = null;

// Completed scorecards. Postgres when DATABASE_URL is set — this is the half of
// the app that has to outlive the process, because a recruiter reads it days
let scorecardsHistory: Scorecard[] = [];

/**
 * Which interview each in-memory scorecard came out of, keyed by session.
 *
 * Ownership is never stored on a scorecard — it is derived through the
 * interview that produced it, which is exactly what the SQL join does. Without
 * this the no-database path had no way to derive it at all, so it returned
 * every scorecard it held to whoever asked: one company's portal listing
 * another company's candidates, mocks included.
 */
const scorecardInterview = new Map<string, string>();

let simulatedElapsed: number | null = null;
export function setSimulatedElapsed(sec: number | null): void {
  simulatedElapsed = sec;
}

export const getModel = (): CandidateModel => ({
  ...model,
  elapsed: simulatedElapsed ?? Math.floor((Date.now() - startedAt) / 1000),
});

export function resetSessionTimer(): void {
  startedAt = Date.now();
}

/**
 * Wipes the interview. The profile survives by default — it is who is sitting
 * in the room, not something they said, and a re-run of the same demo should
 * not make the panel forget the candidate's name. Pass true to clear it too.
 */
export function reset(forgetProfile = false): void {
  const keptDuration = model.durationMin;
  model = emptyModel(`s-${Date.now()}`, forgetProfile ? null : model.profile);
  // The schedule outlives a reset the same way the profile does — it is what
  // the company booked, not something the candidate said.
  model.durationMin = keptDuration;
  startedAt = Date.now();
  held = 0;
  concludedAnnounced = false;
  premiseDenied = false;
  simulatedElapsed = null;
}

/**
 * Trust boundary: everything here is typed by whoever posted to /candidate.
 * Coerce to string, strip control characters (they break the SSE framing and
 * the prompt alike) and cap every field before it reaches an LLM prompt.
 */
export function setProfile(raw: unknown, interviewRow: Interview | null = null): CandidateProfile | null {
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

  // The bar comes off the interview row when there is one, and only from the
  // body when there is not.
  //
  // These three used to be read straight out of the POST, which handed the
  // person being graded the dial that sets how hard the grading is: level
  // drives difficulty and every prompt, and the booked length drives the turn
  // budget, every confidence ceiling, and how long Agora is allowed to bill.
  // The interview row is what the company actually scheduled, so it wins.
  const role = interviewRow
    ? line(interviewRow.role, PROFILE_LIMITS.role)
    : line(input.role, PROFILE_LIMITS.role);
  if (!name || !role) return null;

  const level =
    (interviewRow
      ? line(interviewRow.level, PROFILE_LIMITS.level)
      : line(input.level, PROFILE_LIMITS.level)) || 'Intermediate (2-6 years)';
  const email = line(input.email, PROFILE_LIMITS.email);
  const resumeText = clean(input.resumeText, PROFILE_LIMITS.resumeText).replace(/\n{3,}/g, '\n\n');

  const duration = interviewRow
    ? interviewRow.durationMin
    : asDuration(input.durationMin) ?? DEFAULT_DURATION;

  // Reset interview session and clock to 0s for the candidate
  startedAt = Date.now();
  held = 0;
  concludedAnnounced = false;
  premiseDenied = false;
  model = emptyModel(`s-${Date.now()}`, null);
  model.durationMin = duration;
  sessionInterview = interviewRow;

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

/** The interview this session was opened against, or null if it had no code. */
export const interview = (): Interview | null => sessionInterview;

/**
 * Does the caller know which interview is in the room?
 *
 * The code is the only credential a candidate's browser holds, and it is what
 * separates "the person in this interview" from "anyone who found the
 * hostname". A session with no interview behind it is unguarded, which is what
 * every session used to be.
 */
export function ownsSession(code: unknown): boolean {
  if (!sessionInterview) return false;
  return typeof code === 'string' && code.trim().toUpperCase() === sessionInterview.code;
}

export function addTurn(turn: Omit<TranscriptTurn, 't'>): void {
  // ASR sends a long answer as several growing turns (see continuation.ts).
  // Superseding the earlier one keeps the transcript reading as the single
  // answer it was, and — because turns++ is skipped — stops one talkative
  // candidate from spending half the interview repeating himself to us.
  if (turn.speaker === 'candidate') {
    const previous = [...model.transcript].reverse().find(t => t.speaker === 'candidate');
    if (previous && continues(previous.text, turn.text)) {
      previous.text = turn.text;
      return;
    }
  }

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

// ------------------------------------------------------------------- pacing

/**
 * Questions per scheduled minute.
 *
 * Measured, not chosen: the panel's ten-turn interview ran ten to twelve
 * minutes, which is a question a minute once the panelist's two sentences, the
 * candidate's answer and the ~1.4s decision are all counted. It is the one
 * knob worth turning if real interviews come in consistently short or long —
 * everything else derives from what it produces.
 */
const TURNS_PER_MINUTE = 1;

/**
 * The turn on which the panel stops asking and starts closing.
 *
 * Never below three. A budget that leaves no room to ask anything is not a
 * short interview, it is a broken one, and the floor is cheaper than validating
 * the same thing in four places.
 */
export const concludeAtTurn = (): number =>
  Math.max(3, Math.round(model.durationMin * TURNS_PER_MINUTE));

const WRAP_UP_BUFFER_SEC = 30;

/**
 * Is the interview over?
 *
 * If the wall clock has reached or exceeded the booked duration, the interview is over.
 * If target turns have been reached, we only conclude if time is almost up
 * (within the 30-second wrap-up buffer). If significant time remains, the
 * panel continues generating questions to probe the candidate in greater depth.
 */
export const shouldConclude = (): boolean => {
  const m = getModel();
  const targetSeconds = m.durationMin * 60;
  const targetTurns = concludeAtTurn();

  // Wall clock has reached or exceeded booked duration
  if (m.elapsed >= targetSeconds) return true;


  // If target turns have been reached:
  if (m.turns >= targetTurns) {
    // If time is remaining (more than wrap-up buffer), keep probing in-depth!
    const timeRemaining = targetSeconds - m.elapsed;
    return timeRemaining <= WRAP_UP_BUFFER_SEC;
  }

  return false;
};

/**
 * True exactly once per session, on the first call after the interview is over.
 *
 * The room restarts its leave timer every time it is told the panel concluded,
 * so telling it twice means the call never ends. The old guard was
 * `turns === CONCLUDE_AT_TURN`, which fires once only because turns moves by
 * one — it cannot express "or the clock ran out", so the latch is explicit now.
 */
export function announceConclusion(): boolean {
  if (concludedAnnounced) return false;
  concludedAnnounced = true;
  return true;
}

/**
 * Take one more turn of silence while the candidate is still talking, or refuse
 * because they have had the benefit of the doubt long enough.
 */
export function takeHold(limit: number): boolean {
  if (held >= limit) return false;
  held++;
  return true;
}

/** The candidate said we put words in their mouth. The next turn is told. */
export function notePremiseDenied(): void {
  premiseDenied = true;
}

/** Reads the flag and clears it — one turn is all the warning needs to last. */
export function takePremiseDenied(): boolean {
  const denied = premiseDenied;
  premiseDenied = false;
  return denied;
}

/** They finished. The next continuation starts counting from nothing. */
export function releaseHold(): void {
  held = 0;
}

export const durationMin = (): Duration => model.durationMin;

interface ScorecardRow {
  session_id: string;
  candidate_name: string;
  role: string;
  level: string | null;
  duration_sec: number;
  turns: number;
  dissent: boolean;
  mock: boolean;
  verdicts: Scorecard['verdicts'];
  claims: Scorecard['claims'];
  transcript: Scorecard['transcript'] | null;
  created_at: Date;
}

const toScorecard = (r: ScorecardRow): Scorecard => ({
  sessionId: r.session_id,
  candidateName: r.candidate_name,
  role: r.role,
  level: r.level ?? undefined,
  durationSec: r.duration_sec,
  turns: r.turns,
  dissent: r.dissent,
  mock: r.mock,
  verdicts: r.verdicts,
  claims: r.claims,
  ...(r.transcript ? { transcript: r.transcript } : {}),
  timestamp: r.created_at.getTime(),
});

/**
 * Upsert, because /scorecard is a GET the room may retry — a second request for
 * the same session must correct the row it wrote, not add a duplicate next to it.
 */
export async function saveScorecardToHistory(
  scorecard: Scorecard,
  interviewCode: string | null = null,
): Promise<void> {
  const rows = await query(
    `insert into scorecards
       (session_id, candidate_name, role, level, duration_sec, turns, dissent, mock, verdicts, claims,
        transcript, interview_code)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb,
               (select code from interviews where code = $12))
     on conflict (session_id) do update set
       candidate_name = excluded.candidate_name,
       role           = excluded.role,
       level          = excluded.level,
       duration_sec   = excluded.duration_sec,
       turns          = excluded.turns,
       dissent        = excluded.dissent,
       mock           = excluded.mock,
       verdicts       = excluded.verdicts,
       claims         = excluded.claims,
       transcript     = excluded.transcript,
       interview_code = coalesce(excluded.interview_code, scorecards.interview_code)`,
    [
      scorecard.sessionId,
      scorecard.candidateName,
      scorecard.role,
      scorecard.level ?? null,
      Math.max(0, Math.round(scorecard.durationSec)),
      Math.max(0, Math.round(scorecard.turns ?? 0)),
      scorecard.dissent,
      scorecard.mock === true,
      JSON.stringify(scorecard.verdicts),
      JSON.stringify(scorecard.claims),
      scorecard.transcript ? JSON.stringify(scorecard.transcript) : null,
      // Looked up rather than inserted straight: a code that no longer exists
      // becomes null instead of failing the whole write on a foreign key. The
      // scorecard is the record worth keeping; the link is a convenience.
      interviewCode ? interviewCode.toUpperCase() : null,
    ],
  );
  if (rows !== null) return;

  // Same link the insert above writes into interview_code, kept beside the row
  // rather than on it so the shape the API returns does not change.
  if (interviewCode) scorecardInterview.set(scorecard.sessionId, interviewCode.toUpperCase());

  const idx = scorecardsHistory.findIndex(s => s.sessionId === scorecard.sessionId);
  if (idx >= 0) scorecardsHistory[idx] = scorecard;
  else scorecardsHistory.unshift(scorecard);
}

/**
 * The scorecards one recruiter is allowed to see, newest first.
 *
 * Ownership is not stored on the scorecard — it is derived through the
 * interview that produced it, so there is one place a company's boundary is
 * defined and it cannot drift between two tables.
 *
 * A scorecard with no interview behind it (a mock, or a session that predates
 * invite codes) belongs to nobody and is returned to nobody.
 */
export async function getScorecardsHistory(ownerId: string): Promise<Scorecard[]> {
  const rows = await query<ScorecardRow>(
    `select s.*
       from scorecards s
       join interviews i on i.code = s.interview_code
      where i.owner_id = $1
        and s.mock = false
      order by s.created_at desc
      limit 200`,
    [ownerId],
  );
  if (rows !== null) return rows.map(toScorecard);

  // No database. Derive ownership the same way the join above does — through
  // the interview — rather than handing back the whole list. This returned
  // every company's scorecards to every recruiter, and mocks along with them.
  const owned: Scorecard[] = [];
  for (const card of scorecardsHistory) {
    if (card.mock) continue;
    const code = scorecardInterview.get(card.sessionId);
    if (!code) continue;
    const interview = await findInterview(code);
    if (interview?.ownerId === ownerId) owned.push(card);
  }
  return owned;
}
