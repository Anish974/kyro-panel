// Agora's ASR does not send one message per answer. While the candidate keeps
// talking it fires a turn every few seconds, and each one carries the whole
// utterance so far — not just the new words. A candidate who speaks for twenty
// seconds arrives as four turns:
//
//   "So we are building the UTMS ... over the world, like,"
//   "So we are building the UTMS ... over the world, like, I'm controlling a drone from India and"
//   "So we are building the UTMS ... from India and it is controlled"
//   "So we are building the UTMS ... and it is controlled in the US as well."
//
// Read as four answers, that is a candidate repeating himself, and the panel
// scored exactly that: three NO HIRE verdicts citing "looping" and "repetitive
// text loop" against someone who said it once. It also burned four of the ten
// turns, so the longer a candidate talks the less interview they get.
//
// The tell is that the text GROWS. A candidate who genuinely repeats himself
// says the same words again; ASR continuation appends.

/** Case and whitespace only — ASR punctuates inconsistently between turns. */
const normalise = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Below this, a shared opening is a coincidence rather than a continuation:
 * "Yes, we did" and "Yes, we used Redis" are two answers, not one growing one.
 */
const MIN_PREFIX = 20;

/**
 * True when `later` is `earlier` plus more words — the same utterance, caught
 * again further along. Equal strings are not a continuation: nothing was added,
 * so there is nothing to supersede.
 */
export function continues(earlier: string, later: string): boolean {
  const a = normalise(earlier);
  const b = normalise(later);
  if (a.length < MIN_PREFIX) return false;
  return b.length > a.length && b.startsWith(a);
}
