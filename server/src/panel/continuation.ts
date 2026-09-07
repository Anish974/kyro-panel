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
 * Below this, a shared opening is too short to mean anything.
 *
 * Twenty was too high. A candidate answered "So then paid users" — eighteen
 * characters — was cut off there, finished the sentence four seconds later as
 * "So then paid users during the onboarding process only, they were given a
 * tag…", and because eighteen is under twenty that finished sentence read as a
 * brand new answer. She was interrupted mid-thought and then charged a turn for
 * finishing it, and the panel asked about the half it had already heard.
 *
 * The pair this number was set for does not need it: "Yes, we did" is not a
 * PREFIX of "Yes, we used Redis", so continues() rejects that on its own. The
 * floor only has to rule out two answers that genuinely open with the same
 * words, and fifteen characters of exact agreement is already more coincidence
 * than English usually produces.
 */
const MIN_PREFIX = 15;

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

/**
 * The same utterance again, word for word.
 *
 * `continues` deliberately refuses equal strings — nothing was added, so there
 * is nothing to supersede — and that left a gap. Agora re-sends a final it has
 * already sent, and an exact repeat looked like a brand new answer: it took a
 * turn out of the ten, added a second identical line to the transcript, and
 * earned a second question about the answer just given. One real interview has
 * these back to back a second apart:
 *
 *   [178s] CANDIDATE: And the connection stays down. It will trigger the RTL...
 *   [179s] CANDIDATE: And the connection stays down. It will trigger the RTL...
 *
 * followed by two questions from the same panelist. Read back later, that is a
 * candidate repeating himself and ignoring a question. He did neither.
 */
export function repeats(earlier: string, later: string): boolean {
  const a = normalise(earlier);
  return a.length > 0 && a === normalise(later);
}
