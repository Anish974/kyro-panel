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
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { continues } from './continuation.js';
import { query } from '../db/pool.js';

// Interviews live in memory, one object each, in a Map. This is why the server
// must be long-running and must not be deployed to a serverless platform — a
// cold start loses every interview in flight.
//
// It used to be a single module-level model, which meant one interview per
// process: a second candidate signing in overwrote the first one's transcript
// mid-answer. That is the shape below now, keyed by an unguessable id.
//
// ponytail: still one process. Redis only if this ever has to scale past one.

/** The Agora agent sitting in one session's channel, if it has been started. */
export interface RunningAgent {
  agentId: string;
  channel: string;
  startedAt: number;
}

export interface Session {
  /** Unguessable. It is also the capability: holding it is what authorises
   *  starting an agent and reading this interview's event stream. */
  readonly id: string;
  /** The RTC channel this interview happens in. One channel, one candidate. */
  readonly channel: string;
  model: CandidateModel;
  /** When the interview clock started. Reset when the agent joins. */
  startedAt: number;
  /** Last time anything touched this session, for the idle sweep. */
  touchedAt: number;
  agent: RunningAgent | null;
  /** When the scorecard was handed over. Null while the interview is live. */
  finishedAt: number | null;
  /**
   * How many times this session has been reset. It rides on the model's
   * sessionId, which is the primary key a scorecard is written under — without
   * it a re-run silently overwrites the scorecard of the run before it.
   */
  runs: number;
}

/**
 * How many interviews may be in memory at once.
 *
 * Not a scaling number — a blast radius. Every live session can hold an Agora
 * agent that bills by the minute, so an open sign-in endpoint without this is a
 * way to spend money by looping a fetch.
 */
const MAX_SESSIONS = 50;

/**
 * A session nobody has touched for this long is gone.
 *
 * Longer than any interview (they target 10-12 minutes, and the agent's own cap
 * is 15) but short enough that a browser closed mid-answer does not hold its
 * transcript in memory for the rest of the process's life.
 */
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * And this long once the scorecard has been handed over.
 *
 * A finished interview is finished — the transcript it holds has already been
 * turned into a scorecard and written to Postgres, and the only thing still
 * wanting it is the room retrying the same GET. Two hours was the number for
 * an interview that might yet continue, and holding every completed one for
 * that long is how a server that never restarts runs into MAX_SESSIONS with
 * fifty interviews in memory that all ended.
 */
const FINISHED_TTL_MS = 10 * 60 * 1000;

const sessions = new Map<string, Session>();

/**
 * The session the current request belongs to.
 *
 * Async-local rather than passed down through every call: the panel reads and
 * writes the model from about forty places across bidding, the ledger and the
 * scorecard, and threading a parameter through all of them would be a large
 * diff whose only failure mode is one missed call site quietly operating on the
 * wrong candidate's interview. The context follows an await on its own.
 */
const active = new AsyncLocalStorage<Session>();

/**
 * The session used when nothing has entered one — the self-checks, the CLI in
 * `scripts/agent.ts`, and any route that predates session scoping.
 *
 * It is a real session in the map, so the single-interview behaviour those
 * callers were written against still holds exactly.
 */
export const AMBIENT_ID = 'ambient';

function blank(id: string, profile: CandidateProfile | null = null): Session {
  return {
    id,
    // One channel per interview. Everyone used to join a single `demo-channel`,
    // which meant anyone who opened the app walked into whichever interview was
    // live and could hear it.
    //
    // Its name is random on its own account rather than derived from the session
    // id. A channel name is not a secret in practice — it shows up in the Agora
    // console, in RTC diagnostics and in anything watching the network — and
    // `kyro-${id}` would have made every one of those places a printout of the
    // session id, which IS the capability for this interview's event stream and
    // its agent. Knowing the channel now buys nothing but the channel.
    channel: `kyro-${randomBytes(12).toString('hex')}`,
    model: emptyModel(id, profile),
    startedAt: Date.now(),
    touchedAt: Date.now(),
    agent: null,
    finishedAt: null,
    runs: 0,
  };
}

/**
 * The ambient session reads its channel from the environment, and reads it
 * late: this module is imported before index.ts has loaded the .env file, so a
 * value captured here would be the default no matter what is configured.
 */
sessions.set(AMBIENT_ID, {
  ...blank(AMBIENT_ID),
  get channel() {
    return process.env.AGORA_CHANNEL?.trim() || 'demo-channel';
  },
});

/** The session this call belongs to. Never null — falls back to the ambient one. */
export function session(): Session {
  const s = active.getStore() ?? sessions.get(AMBIENT_ID)!;
  s.touchedAt = Date.now();
  return s;
}

/** Runs `fn` with `s` as the current session. Everything awaited inside sees it. */
export function inSession<T>(s: Session, fn: () => T): T {
  s.touchedAt = Date.now();
  return active.run(s, fn);
}

export const findSession = (id: string | undefined | null): Session | null =>
  (id && sessions.get(id)) || null;

/**
 * The live interview happening in a channel, so /token can refuse every other
 * one. A channel with no session behind it is not a channel we will mint for.
 *
 * The ambient session is deliberately skipped, always. It answers to whatever
 * AGORA_CHANNEL is set to, and a deployment with that variable set — which is
 * every deployment carried over from before this change — would otherwise still
 * hand a publisher token for the old shared channel to anyone who asked for it.
 * That is the hole this whole change exists to close, so it does not get an
 * exception for being the way things used to work.
 *
 * Nothing legitimate needs one: the browser always holds a real session, and
 * the CLI in `scripts/agent.ts` mints its own token in-process without going
 * near this endpoint.
 */
export const sessionForChannel = (channel: string): Session | null => {
  if (!channel) return null;
  for (const s of sessions.values()) {
    if (s.id === AMBIENT_ID) continue;
    if (s.channel === channel) return s;
  }
  return null;
};

/**
 * Starts a new interview and returns its session.
 *
 * The id is 128 bits of randomness because it is the only thing standing
 * between a stranger and someone else's live interview — `s-${Date.now()}`,
 * which is what this used to be, is a number anyone can type.
 */
export function createSession(): Session {
  sweep();
  if (sessions.size - 1 >= MAX_SESSIONS) {
    throw new Error('too many interviews are running — try again in a few minutes');
  }
  const s = blank(randomBytes(16).toString('hex'));
  sessions.set(s.id, s);
  return s;
}

/** Called when a session is dropped, so its Agora agent can be stopped too. */
type Evicted = (s: Session) => void;
let onEvicted: Evicted = () => {};
export const whenEvicted = (fn: Evicted): void => { onEvicted = fn; };

export function endSession(id: string): void {
  const s = sessions.get(id);
  if (!s || id === AMBIENT_ID) return;
  sessions.delete(id);
  onEvicted(s);
}

/**
 * Drops sessions nobody has touched in a while. Cheap, so it runs on create.
 *
 * A finished interview is measured from when it finished, not from when it was
 * last touched — the room polls `/scorecard` and each poll would otherwise push
 * a completed interview's eviction another ten minutes into the future.
 */
export function sweep(): number {
  const now = Date.now();
  let dropped = 0;
  for (const [id, s] of sessions) {
    if (id === AMBIENT_ID) continue;
    const ttl = s.finishedAt === null ? SESSION_TTL_MS : FINISHED_TTL_MS;
    const idleSince = s.finishedAt ?? s.touchedAt;
    if (now - idleSince < ttl) continue;
    sessions.delete(id);
    onEvicted(s);
    dropped++;
  }
  return dropped;
}

export const liveSessions = (): number => sessions.size - 1;

/**
 * The interview is over: its scorecard has been built and stored.
 *
 * This does not delete the session, because `/scorecard` is a GET the room may
 * retry and the answer has to stay available for a little while. It starts the
 * short clock in `sweep` instead. Called more than once, the first call wins —
 * a retry must not keep pushing the eviction back.
 */
export function finish(): void {
  const s = session();
  if (s.id !== AMBIENT_ID && s.finishedAt === null) s.finishedAt = Date.now();
}

// Completed scorecards. Postgres when DATABASE_URL is set — this is the half of
// the app that has to outlive the process, because a recruiter reads it days
let scorecardsHistory: Scorecard[] = [];

export const getModel = (): CandidateModel => {
  const s = session();
  return { ...s.model, elapsed: Math.floor((Date.now() - s.startedAt) / 1000) };
};

export function resetSessionTimer(): void {
  session().startedAt = Date.now();
}

/**
 * Wipes the interview. The profile survives by default — it is who is sitting
 * in the room, not something they said, and a re-run of the same demo should
 * not make the panel forget the candidate's name. Pass true to clear it too.
 */
export function reset(forgetProfile = false): void {
  const s = session();
  s.runs++;
  s.model = emptyModel(`${s.id}-${s.runs}`, forgetProfile ? null : s.model.profile);
  s.startedAt = Date.now();
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

  // Reset interview session and clock to 0s for the candidate
  const s = session();
  s.startedAt = Date.now();
  s.runs++;
  s.model = emptyModel(`${s.id}-${s.runs}`, null);

  s.model.profile = {
    name,
    role,
    level,
    ...(email ? { email } : {}),
    ...(resumeText ? { resumeText } : {}),
  };

  // Calibrate initial starting difficulty based on the candidate's declared experience level
  if (level.includes('Intern')) {
    s.model.difficulty = 1;
  } else if (level.includes('Beginner')) {
    s.model.difficulty = 2;
  } else if (level.includes('Intermediate')) {
    s.model.difficulty = 3;
  } else if (level.includes('Expert')) {
    s.model.difficulty = 4;
  }

  return s.model.profile;
}

export const profile = (): CandidateProfile | null => session().model.profile;

export function addTurn(turn: Omit<TranscriptTurn, 't'>): void {
  const m = session().model;

  // ASR sends a long answer as several growing turns (see continuation.ts).
  // Superseding the earlier one keeps the transcript reading as the single
  // answer it was, and — because turns++ is skipped — stops one talkative
  // candidate from spending half the interview repeating himself to us.
  if (turn.speaker === 'candidate') {
    const previous = [...m.transcript].reverse().find(t => t.speaker === 'candidate');
    if (previous && continues(previous.text, turn.text)) {
      previous.text = turn.text;
      return;
    }
  }

  m.transcript.push({ ...turn, t: getModel().elapsed });
  if (turn.speaker === 'candidate') m.turns++;
  else m.lastSpeaker = turn.speaker;
}

export const hasGap = (gap: string): boolean => session().model.gaps.includes(gap);

export function addGap(gap: string): void {
  const m = session().model;
  if (!m.gaps.includes(gap)) m.gaps.push(gap);
}

export function addClaim(claim: Omit<Claim, 'id' | 't'>): Claim {
  const m = session().model;
  const full: Claim = { ...claim, id: `c${m.claims.length + 1}`, t: getModel().elapsed };
  m.claims.push(full);
  return full;
}

export function updateClaim(id: string, patch: Partial<Claim>): Claim | null {
  const claim = session().model.claims.find(c => c.id === id);
  if (!claim) return null;
  Object.assign(claim, patch);
  return claim;
}

/** Opens a role-play. Refuses if one is already running — one at a time. */
export function openScenario(premise: string, openedBy: PanelistId): Scenario | null {
  const m = session().model;
  if (m.scenario) return null;
  m.scenario = { premise, openedBy, t: getModel().elapsed, turns: 0 };
  return m.scenario;
}

export function closeScenario(): void {
  session().model.scenario = null;
}

/** Counts one candidate answer given inside the running role-play. */
export function advanceScenario(): void {
  const m = session().model;
  if (m.scenario) m.scenario.turns++;
}

export const scenario = (): Scenario | null => session().model.scenario;

/** Nudge a competency toward `target`. Scores move, they do not jump. */
export function nudgeSkill(id: CompetencyId, target: number, weight = 0.35): void {
  const m = session().model;
  const current = m.skills[id];
  m.skills[id] = Math.round((current + (target - current) * weight) * 100) / 100;
}

/** Difficulty follows demonstrated competence, clamped to 1..5. */
export function adjustDifficulty(delta: number): void {
  const m = session().model;
  m.difficulty = Math.max(1, Math.min(5, m.difficulty + delta));
}

export const lastSpeaker = (): PanelistId | null => session().model.lastSpeaker;

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
        interview_code)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb,
               (select code from interviews where code = $11))
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
      // Looked up rather than inserted straight: a code that no longer exists
      // becomes null instead of failing the whole write on a foreign key. The
      // scorecard is the record worth keeping; the link is a convenience.
      interviewCode ? interviewCode.toUpperCase() : null,
    ],
  );
  if (rows !== null) return;

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
  return rows === null ? scorecardsHistory : rows.map(toScorecard);
}
