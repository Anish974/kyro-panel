import { randomBytes } from 'node:crypto';
import { EXPERIENCE_LEVELS, PROFILE_LIMITS, type Interview } from '@kyro/shared';

// Who decides the bar.
//
// The login screen used to let the candidate pick their own role and their own
// experience level, and level feeds difficulty (model.ts applyProfile) — so the
// person being graded chose how hard the grading was. Pick "Intern" and the
// panel goes easy. No hiring process works that way: the company posts the role
// and the bar, the candidate turns up.
//
// An interview is created by the company, which gets back a code. The candidate
// opens the link, sees the role and level already set, and can only confirm who
// they are. The code is also the first thing this app has that identifies one
// interview from another — /token, /agent/start and /scorecard all currently
// take anyone who asks, and this is what they will be gated on.

// ponytail: in memory, like the session it belongs to. Codes die when the
// process restarts, which on Render's free tier is every 15 idle minutes. Give
// them a real store at the same time as the scorecard history, not before.
const interviews = new Map<string, Interview>();

/**
 * Crockford's alphabet: no I, L, O or U, so a code read down a phone line or
 * typed off a screenshot cannot become a different valid code. Six characters
 * is ~1e9 — plenty when a code is handed out rather than guessed at.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function newCode(): string {
  for (;;) {
    const code = [...randomBytes(6)].map(b => ALPHABET[b % ALPHABET.length]).join('');
    if (!interviews.has(code)) return code;
  }
}

export class InterviewError extends Error {}

const clean = (value: unknown, limit: number): string =>
  String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);

/**
 * Schedule one interview. Returns the code the link is built on.
 *
 * `mock: true` marks practice a candidate set up for themselves. The only
 * difference is what it means afterwards — a mock result is not hiring data and
 * never reaches the company portal.
 */
export function create(input: {
  candidateName: unknown;
  role: unknown;
  level: unknown;
  mock?: unknown;
}): Interview {
  const candidateName = clean(input.candidateName, PROFILE_LIMITS.name);
  const role = clean(input.role, PROFILE_LIMITS.role);
  const level = clean(input.level, PROFILE_LIMITS.level);

  if (!candidateName) throw new InterviewError('candidate name is required');
  if (!role) throw new InterviewError('role is required');

  // The level sets the difficulty, so it has to be one of ours rather than
  // whatever arrived — an unrecognised string would silently grade as default.
  if (!(EXPERIENCE_LEVELS as readonly string[]).includes(level)) {
    throw new InterviewError('level must be one of the published experience levels');
  }

  const interview: Interview = {
    code: newCode(),
    candidateName,
    role,
    level,
    createdAt: Date.now(),
    startedAt: null,
    mock: input.mock === true,
  };
  interviews.set(interview.code, interview);
  return interview;
}

/** Candidate side: what the invite link resolves to. Null when it does not. */
export function find(code: string): Interview | null {
  return interviews.get(clean(code, 16).toUpperCase()) ?? null;
}

/**
 * Newest first — the company portal reads it as a schedule.
 *
 * Two interviews scheduled in the same millisecond tie on createdAt, and a
 * stable sort then leaves them in insertion order: oldest first, in the list
 * that promises newest first. Reversing before sorting settles the tie the
 * only way a reader would expect.
 */
export function list(): Interview[] {
  return [...interviews.values()].reverse().sort((a, b) => b.createdAt - a.createdAt);
}

/** Marks the moment the candidate actually joined, so the portal can show it. */
export function markStarted(code: string): Interview | null {
  const interview = find(code);
  if (!interview) return null;
  interview.startedAt ??= Date.now();
  return interview;
}

/** Test seam. The store is process-wide, so a check must be able to empty it. */
export function reset(): void {
  interviews.clear();
}
