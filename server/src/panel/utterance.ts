// Not everything a candidate says is an answer.
//
// A real interview opens with logistics — "am I audible?", "can you hear me?" —
// and carries clarifying questions all the way through: "sorry, could you say
// that again?". A human panel answers those and then waits. It does not grade
// them, and it does not count them as one of the ten questions.
//
// Before this existed, "am I audible" went through the whole panel as turn 1.
// The turn-1 prompt says "this is their introduction, ask about it or their
// resume" — so with nothing in the utterance to work with, the panel dived
// straight into the resume. The candidate had not said a word about themselves
// yet and was already being asked about data skew across Spark executors.

export type UtteranceKind = 'audio-check' | 'clarify' | 'answer';

/**
 * Only a SHORT utterance can be an audio check.
 *
 * "Can you hear me?" on its own is logistics. The same words inside "the
 * on-call engineer would ping me and ask can you hear me on the bridge" are
 * part of an answer, and grading it as logistics would throw away a real turn.
 * Length is what separates them, and it is the whole guard — the patterns below
 * are deliberately loose because this cap keeps them honest.
 */
const SHORT = 80;

/** Pure logistics. The panel confirms and hands the floor straight back. */
const AUDIO_CHECK =
  /\b(am i audible|can you (hear|listen to) me|do you (hear|read) me|are you (there|able to hear)|is (this|my mic|the mic|it) (on|working|audible)|mic check|sound check|am i (coming through|audible now)|hello,? ?(is )?(anyone|anybody) there)\b/i;

/** They want something repeated or explained before they can answer. */
const CLARIFY =
  /\b(can you (repeat|say that again)|could you (repeat|say that again|clarify|rephrase)|say (that|it) again|come again|sorry,? what|what was (that|the question)|repeat the question|i did ?n[o']?t (catch|hear|get) that|pardon)\b/i;

/**
 * The whole utterance is a greeting or a sound check and nothing else.
 *
 * Anchored on purpose. "Testing" alone is a mic check; "I was testing the
 * pipeline" is an answer, and a loose \btesting\b would swallow it. "Hi" is not
 * an introduction either — treating it as one burns the introduction turn on a
 * single syllable.
 */
const BARE_CHECK =
  /^\s*(hi|hey|hello|yo|namaste|good (morning|afternoon|evening)|testing|test|mic test|audio test|check)([\s.,!?]|\b(one|two|three|1|2|3)\b)*$/i;

export function classify(text: string): UtteranceKind {
  const t = text.trim();
  if (!t) return 'answer'; // The empty case is handled before this, in the route.

  // Long enough to be a real answer, whatever words are in it.
  if (t.length > SHORT) return 'answer';

  if (AUDIO_CHECK.test(t) || BARE_CHECK.test(t)) return 'audio-check';
  if (CLARIFY.test(t)) return 'clarify';
  return 'answer';
}

/**
 * What the panel says back, without spending a turn or an LLM call.
 *
 * Warm and short, because the point is to get out of the way: the candidate is
 * waiting to start, not looking for conversation.
 */
export function replyTo(kind: 'audio-check' | 'clarify', lastQuestion: string | null): string {
  if (kind === 'audio-check') {
    return "Yes, we can hear you clearly. Whenever you are ready, go ahead and introduce yourself.";
  }
  // Repeating the actual question beats "could you elaborate" — the candidate
  // asked because they lost it, so give it back to them verbatim.
  return lastQuestion
    ? `Of course. ${lastQuestion}`
    : 'Of course — take your time and tell us a little about yourself to start.';
}
