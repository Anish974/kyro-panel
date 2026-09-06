import type { RoleSuggestion } from '@kyro/shared';
import { LLM_ENABLED, ask, parseJson } from './llm.js';
import { getModel } from './model.js';

// "Not for this role — but look at that one."
//
// An interview that ends in a no is usually a candidate thrown away twice: once
// by the panel, and once by a company that already has other roles open and
// never thought to check. This is the second look, and it runs on the same
// transcript the verdicts came from.
//
// Two rules make it a recommendation rather than a guess:
//
//   1. It may only name a role the recruiter has actually scheduled. A suggested
//      role nobody is hiring for is worse than no suggestion — it reads like an
//      offer, and there is nothing behind it.
//   2. It must quote the candidate verbatim. A redirect is a decision about a
//      real person's career, and "they seemed more infra-shaped" is not a reason
//      anyone can check. The quote is verified against the transcript here, not
//      trusted from the model.

/** Short: one role, one sentence, one quote. */
const MAX_TOKENS = 220;

interface RawSuggestion {
  role?: unknown;
  reason?: unknown;
  quote?: unknown;
}

/**
 * Normalises for comparison — a model that answers "senior backend engineer"
 * when the schedule says "Senior Backend Engineer" has picked a real role, and
 * refusing that on case would throw away a correct answer.
 */
const key = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Finds the quote in the transcript and returns it as the candidate said it.
 *
 * Matching is done on collapsed whitespace, but what comes back is the real
 * turn's text and timestamp — so the card cites the transcript rather than the
 * model's paraphrase of it, and clicking through to the moment still works.
 */
function verify(quote: string): { quote: string; t: number } | null {
  const needle = key(quote);
  if (needle.length < 12) return null;

  for (const turn of getModel().transcript) {
    if (turn.speaker !== 'candidate') continue;
    if (!key(turn.text).includes(needle)) continue;
    return {
      quote: turn.text.length > 180 ? turn.text.slice(0, 177) + '…' : turn.text,
      t: turn.t,
    };
  }
  return null;
}

function prompt(current: string, roles: string[]): string {
  return [
    'You are the hiring manager reading a finished interview.',
    '',
    `This candidate interviewed for "${current}" and the panel did not recommend them for it.`,
    'Your job is the second question: is there another role this company has open',
    'that they would actually be good at, based only on what they said today?',
    '',
    'The roles currently open here, and the ONLY ones you may name:',
    ...roles.map(r => `- ${r}`),
    '',
    'Most of the time the honest answer is no. Say no. A redirect that is not',
    'strongly supported by the transcript wastes a recruiter\'s time and raises a',
    "candidate's hopes, which is worse than saying nothing.",
    '',
    'Reply with JSON only:',
    '{"role": "exactly one role from the list above, or null",',
    ' "reason": "one sentence a hiring manager can act on",',
    ' "quote": "the candidate\'s own words that show it, copied EXACTLY from the transcript"}',
    '',
    'The quote must be verbatim. A quote that is not in the transcript is thrown',
    'away along with the suggestion.',
  ].join('\n');
}

function evidence(): string {
  const answers = getModel()
    .transcript.filter(t => t.speaker === 'candidate' && t.text.trim())
    .map(t => `CANDIDATE: ${t.text}`);
  return ['What the candidate said, in full:', '', ...answers].join('\n');
}

/**
 * The role this candidate should be looked at for instead, or null.
 *
 * Null is the expected answer and every failure resolves to it: no roles open,
 * no key configured, a model that declined, a role it invented, a quote it did
 * not take from the transcript. A scorecard is never held up or broken by this
 * — the suggestion is a bonus on top of a card that already stands on its own.
 */
export async function suggestRole(
  currentRole: string,
  rolesOpen: string[],
): Promise<RoleSuggestion | null> {
  const roles = rolesOpen.filter(r => r.trim() && key(r) !== key(currentRole));
  if (!roles.length || !LLM_ENABLED) return null;

  // Nothing said, nothing to go on. This also covers an interview that ended
  // before the candidate spoke, where any suggestion would be invented.
  if (getModel().transcript.filter(t => t.speaker === 'candidate').length < 2) return null;

  try {
    const raw = parseJson<RawSuggestion>(await ask(prompt(currentRole, roles), evidence(), MAX_TOKENS));
    if (!raw?.role || typeof raw.role !== 'string') return null;

    // Only a role that is really open. A model naming something plausible but
    // unscheduled is the failure this check exists for.
    const named = roles.find(r => key(r) === key(String(raw.role)));
    if (!named) {
      console.warn(`[redirect] model named "${String(raw.role)}", which nobody is hiring for — dropped`);
      return null;
    }

    const quoted = typeof raw.quote === 'string' ? verify(raw.quote) : null;
    if (!quoted) {
      console.warn(`[redirect] no verbatim quote behind the ${named} suggestion — dropped`);
      return null;
    }

    const reason = String(raw.reason ?? '').trim().slice(0, 240);
    if (!reason) return null;

    return { role: named, reason, evidence: quoted };
  } catch (err) {
    console.warn('[redirect] suggestion skipped:', (err as Error).message);
    return null;
  }
}
