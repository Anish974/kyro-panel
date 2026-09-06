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
import { continues } from './continuation.js';
import { query } from '../db/pool.js';

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

// Completed scorecards. Postgres when DATABASE_URL is set — this is the half of
// the app that has to outlive the process, because a recruiter reads it days
// after the interview and Render's free tier restarts long before that.
//
// The rows below are the fallback for a checkout with no database: something to
// look at in the portal rather than an empty page. They are never written to
// Postgres, so a real deployment shows real interviews only.
let scorecardsHistory: Scorecard[] = [
  {
    sessionId: 'kyro-anish-01',
    candidateName: 'Anish Patankar',
    role: 'Senior Backend Engineer',
    level: 'Expert (6-11+ years)',
    durationSec: 705,
    timestamp: Date.now() - 3600 * 1000 * 2,
    turns: 10,
    dissent: false,
    verdicts: [
      {
        panelist: 'technical',
        verdict: 'hire',
        score: 4.5,
        confidence: 0.92,
        rationale: 'Deep mastery of distributed async pipelines, low-latency streaming architectures, and multi-agent state orchestration.',
        evidence: [
          { quote: 'We designed an event-driven SSE and WebSocket bridge with in-memory state models to keep turn round-trip latency under 1200ms.', t: 215 },
          { quote: 'To prevent cascade failures during concurrent bidding, we isolated agent turns into a single round-trip evaluation cycle.', t: 460 },
        ],
        ratings: { technicalDepth: 4.6, problemSolving: 4.4, communication: 4.5 },
      },
      {
        panelist: 'product',
        verdict: 'hire',
        score: 4.2,
        confidence: 0.89,
        rationale: 'Strong alignment on real-time candidate experience, audio silence coverage, and seamless interviewer pacing.',
        evidence: [
          { quote: 'We added synchronized presence and active speaker detection so candidates never felt they were talking over the panel.', t: 340 },
        ],
        ratings: { impact: 4.3, problemSolving: 4.1, communication: 4.2 },
      },
      {
        panelist: 'hr',
        verdict: 'hire',
        score: 4.4,
        confidence: 0.9,
        rationale: 'Demonstrated direct architectural ownership, transparent risk management, and collaborative cross-functional execution.',
        evidence: [
          { quote: 'I led the end-to-end multi-agent protocol design and coordinated testing between backend services and client state.', t: 520 },
        ],
        ratings: { ownership: 4.6, communication: 4.4, problemSolving: 4.2 },
      },
    ],
    claims: [
      { id: 'c1', text: 'Designed and deployed multi-agent voice orchestration architecture achieving sub-1.2s response latency.', t: 180, status: 'verified' },
      { id: 'c2', text: 'Built real-time audio-level visualizer and WebRTC candidate stream synchronization.', t: 410, status: 'verified' },
    ],
  },
  {
    sessionId: 'kyro-nidhi-02',
    candidateName: 'Nidhi Dharme',
    role: 'Full-Stack Engineer',
    level: 'Intermediate (2-6 years)',
    durationSec: 630,
    timestamp: Date.now() - 3600 * 1000 * 5,
    turns: 9,
    dissent: false,
    verdicts: [
      {
        panelist: 'technical',
        verdict: 'hire',
        score: 4.2,
        confidence: 0.88,
        rationale: 'Clean component modularity, effective Web Audio API integration for live mic waveforms, and solid responsive UI state management.',
        evidence: [
          { quote: 'We connected the Web Audio API AnalyserNode directly to the canvas visualizer for real-time decibel level feedback.', t: 195 },
          { quote: 'Optimized rendering cycles to ensure camera preview and live closed captions stream without UI blocking.', t: 380 },
        ],
        ratings: { technicalDepth: 4.1, problemSolving: 4.2, communication: 4.3 },
      },
      {
        panelist: 'product',
        verdict: 'hire',
        score: 4.4,
        confidence: 0.91,
        rationale: 'Outstanding product intuition for candidate comfort: pre-join greenroom checks, clear camera/mic toggles, and structured reports.',
        evidence: [
          { quote: 'Candidate confidence increases significantly when they can verify audio and video inputs in a dedicated pre-join greenroom.', t: 310 },
        ],
        ratings: { impact: 4.6, problemSolving: 4.3, communication: 4.3 },
      },
      {
        panelist: 'hr',
        verdict: 'hire',
        score: 4.3,
        confidence: 0.87,
        rationale: 'High proactive ownership, user empathy, clear communication under deadlines, and team collaboration.',
        evidence: [
          { quote: 'Took direct responsibility for candidate onboarding experience and streamlined the assessment report layout.', t: 470 },
        ],
        ratings: { ownership: 4.4, communication: 4.4, problemSolving: 4.1 },
      },
    ],
    claims: [
      { id: 'c1', text: 'Implemented pre-join device verification greenroom with real-time mic waveform analyzer.', t: 150, status: 'verified' },
      { id: 'c2', text: 'Engineered candidate assessment matrix and interactive recruiter dashboard.', t: 390, status: 'verified' },
    ],
  },
];

export const getModel = (): CandidateModel => ({
  ...model,
  elapsed: Math.floor((Date.now() - startedAt) / 1000),
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

  // Reset interview session and clock to 0s for the candidate
  startedAt = Date.now();
  model = emptyModel(`s-${Date.now()}`, null);

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
