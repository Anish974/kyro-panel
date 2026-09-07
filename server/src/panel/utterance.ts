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

export type UtteranceKind = 'audio-check' | 'clarify' | 'thinking' | 'answer';

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

/**
 * They are asking for a moment to think.
 *
 * A hard system-design question deserves a pause, and saying so out loud is
 * what a candidate actually does. Graded as an answer it is a terrible one —
 * "let me think" scores near zero on every axis and burns a question. A human
 * panel says "take your time" and waits.
 */
const THINKING =
  /\b(let me think|give me a (second|moment|minute)|hold on|one (second|moment|minute)|i need a (second|moment|minute)|let me (gather|collect) my thoughts|thinking(\s+about (it|that))?|bear with me|just a (sec|second|moment))\b/i;

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

/**
 * The whole utterance is the candidate saying "go on".
 *
 * "Yeah. Okay." is not an answer to "what data structure did you use". It was
 * graded as one: it spent a turn out of the ten, and it sits in the transcript
 * under a real question, so the write-up at the end reads a candidate who
 * answered a technical question with the word "okay". One interview lost three
 * of its eleven turns this way — "Sound", "Yeah. Okay." and "Okay, sir." — and
 * every panelist marked him down for evasiveness he never showed.
 *
 * Anchored like BARE_CHECK, so only the whole utterance counts. "Okay, so we
 * sharded by tenant" is an answer that happens to start with okay.
 */
const BARE_ACK =
  /^\s*((yeah|yes|yep|ya|ok|okay|k|alright|right|sure|fine|got it|understood|no problem|continue|go on|carry on|please continue|hmm+|mhm+|uh huh)[\s.,!?]*(sir|ma'?am|madam)?[\s.,!?]*)+$/i;

/**
 * The one shape that stays an answer: a bare yes or no, on its own.
 *
 * "Did you measure it?" — "Yes." is a real answer to a real question, and
 * throwing it away would cost the candidate a turn they actually took. Two of
 * them together is different: "Yeah. Okay." answers nothing.
 */
const SOLE_YES_NO = /^\s*(yes|yeah|yep|ya|no|nope)[\s.,!?]*$/i;

/**
 * A short utterance that stops on a word an English sentence cannot end on.
 *
 * ASR finalises on a pause, not on a sentence, so a candidate drawing breath
 * mid-thought arrives as "Okay. So" and then "Okay. So I'm on a". Both were
 * read as answers: each burned one of the ten turns and each got its own
 * question back, which is how one candidate was asked two things before
 * finishing a sentence.
 *
 * Conjunctions, articles, prepositions and possessives only. Words like "it",
 * "that" and "we" were in this list once and should not be — "No, we never
 * measured it" is a finished answer, and a short one is exactly when the panel
 * must not mistake brevity for a fragment.
 */
const DANGLING = /\b(and|so|but|or|because|the|a|an|to|of|for|with|in|on|at|i'?m|i'?ve|my)$/i;

/** A finished sentence, however short. ASR punctuates; a cut-off turn does not. */
const TERMINATED = /[.?!]\s*$/;

export function classify(text: string): UtteranceKind {
  const t = text.trim();
  if (!t) return 'answer'; // The empty case is handled before this, in the route.

  // Long enough to be a real answer, whatever words are in it.
  if (t.length > SHORT) return 'answer';

  if (AUDIO_CHECK.test(t) || BARE_CHECK.test(t)) return 'audio-check';

  // "Okay, sir." is the candidate waiting, not answering. Handing the question
  // back is what a panel does — and it costs neither a turn nor an LLM call.
  if (BARE_ACK.test(t) && !SOLE_YES_NO.test(t)) return 'clarify';
  // Clarify before thinking: "give me a second" is a pause, but "could you say
  // that again, give me a second" is really a request to repeat.
  if (CLARIFY.test(t)) return 'clarify';
  if (THINKING.test(t)) return 'thinking';

  // Last, so a recognised phrase wins first: "is my mic on" ends on a dangling
  // word but is logistics, not an unfinished thought.
  if (!TERMINATED.test(t) && DANGLING.test(t)) return 'thinking';

  return 'answer';
}

/**
 * What the panel says back, without spending a turn or an LLM call.
 *
 * Warm and short, because the point is to get out of the way: the candidate is
 * waiting to start, not looking for conversation.
 */
export function replyTo(kind: Exclude<UtteranceKind, 'answer'>, lastQuestion: string | null): string {
  if (kind === 'audio-check') {
    return 'Yes, we can hear you clearly. Whenever you are ready, go ahead and introduce yourself.';
  }

  // Short on purpose. They asked for silence to think in, so the worst thing
  // the panel can do is fill it.
  if (kind === 'thinking') return 'Take your time.';

  // Repeating the actual question beats "could you elaborate" — the candidate
  // asked because they lost it, so give it back to them verbatim.
  return lastQuestion
    ? `Of course. ${lastQuestion}`
    : 'Of course — take your time and tell us a little about yourself to start.';
}
