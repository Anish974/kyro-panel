import { randomBytes } from 'node:crypto';
import { EXPERIENCE_LEVELS, PROFILE_LIMITS, type Interview } from '@kyro/shared';
import { query } from '../db/pool.js';

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
//
// Backed by Postgres when DATABASE_URL is set, and by the map below when it is
// not. The fallback is not a nicety: the self-checks run with no network, and a
// fresh checkout has to work before anyone has a database.
const interviews = new Map<string, Interview>();

/**
 * Crockford's alphabet: no I, L, O or U, so a code read down a phone line or
 * typed off a screenshot cannot become a different valid code. Six characters
 * is ~1e9 — plenty when a code is handed out rather than guessed at.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const randomCode = (): string =>
  [...randomBytes(6)].map(b => ALPHABET[b % ALPHABET.length]).join('');

interface Row {
  code: string;
  candidate_name: string;
  role: string;
  level: string;
  mock: boolean;
  owner_id: string | null;
  created_at: Date;
  started_at: Date | null;
}

const toInterview = (r: Row): Interview => ({
  code: r.code,
  candidateName: r.candidate_name,
  role: r.role,
  level: r.level,
  mock: r.mock,
  ownerId: r.owner_id,
  createdAt: r.created_at.getTime(),
  startedAt: r.started_at ? r.started_at.getTime() : null,
});

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
export async function create(input: {
  candidateName: unknown;
  role: unknown;
  level: unknown;
  mock?: unknown;
  /** The verified recruiter. Never read off the request body. */
  ownerId?: string | null;
}): Promise<Interview> {
  const candidateName = clean(input.candidateName, PROFILE_LIMITS.name);
  const role = clean(input.role, PROFILE_LIMITS.role);
  const level = clean(input.level, PROFILE_LIMITS.level);
  const mock = input.mock === true;
  const ownerId = mock ? null : (input.ownerId ?? null);

  if (!candidateName) throw new InterviewError('candidate name is required');
  if (!role) throw new InterviewError('role is required');

  // The level sets the difficulty, so it has to be one of ours rather than
  // whatever arrived — an unrecognised string would silently grade as default.
  if (!(EXPERIENCE_LEVELS as readonly string[]).includes(level)) {
    throw new InterviewError('level must be one of the published experience levels');
  }

  // Retry on collision rather than checking first: with 1e9 codes a clash is
  // rare, and a select-then-insert is a race the primary key would catch anyway.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const rows = await query<Row>(
      `insert into interviews (code, candidate_name, role, level, mock, owner_id)
            values ($1, $2, $3, $4, $5, $6)
       on conflict (code) do nothing
         returning *`,
      [code, candidateName, role, level, mock, ownerId],
    );

    if (rows === null) {
      if (interviews.has(code)) continue;
      const interview: Interview = {
        code,
        candidateName,
        role,
        level,
        mock,
        ownerId,
        createdAt: Date.now(),
        startedAt: null,
      };
      interviews.set(code, interview);
      return interview;
    }

    if (rows.length) return toInterview(rows[0]);
  }

  throw new InterviewError('could not allocate an interview code');
}

/** Candidate side: what the invite link resolves to. Null when it does not. */
export async function find(code: string): Promise<Interview | null> {
  const key = clean(code, 16).toUpperCase();
  const rows = await query<Row>('select * from interviews where code = $1', [key]);
  if (rows === null) return interviews.get(key) ?? null;
  return rows.length ? toInterview(rows[0]) : null;
}

/**
 * One recruiter's schedule, newest first. Scoped by owner, not filtered in the
 * caller: a list endpoint that fetches everything and trims afterwards is one
 * forgotten filter away from handing over every company's candidates.
 *
 * Two interviews scheduled in the same millisecond tie on createdAt, and a
 * stable sort then leaves them in insertion order: oldest first, in the list
 * that promises newest first. Reversing before sorting settles the tie the
 * only way a reader would expect.
 */
export async function list(ownerId: string): Promise<Interview[]> {
  const rows = await query<Row>(
    'select * from interviews where owner_id = $1 order by created_at desc, code desc limit 200',
    [ownerId],
  );
  if (rows === null) {
    return [...interviews.values()]
      .reverse()
      .filter(i => i.ownerId === ownerId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  return rows.map(toInterview);
}

/** Marks the moment the candidate actually joined, so the portal can show it. */
export async function markStarted(code: string): Promise<Interview | null> {
  const key = clean(code, 16).toUpperCase();
  // coalesce, not a plain set: a refresh must not restart the clock.
  const rows = await query<Row>(
    'update interviews set started_at = coalesce(started_at, now()) where code = $1 returning *',
    [key],
  );
  if (rows === null) {
    const interview = interviews.get(key);
    if (!interview) return null;
    interview.startedAt ??= Date.now();
    return interview;
  }
  return rows.length ? toInterview(rows[0]) : null;
}

/** Test seam. The in-memory store is process-wide, so a check must empty it. */
export function reset(): void {
  interviews.clear();
}
