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

export type UtteranceKind = 'audio-check' | 'clarify' | 'thinking' | 'correction' | 'end' | 'answer';

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
  /\b(am i audible|(are|is) (you|the panel|anyone) (audible|coming through)|(you are|you're|you guys are|sir you are) (not audible|inaudible|hard to hear|not clear)|not audible|can you (hear|listen to) me|do you (hear|read) me|are you (there|able to hear)|is (this|my mic|the mic|it) (on|working|audible)|mic check|sound check|am i (coming through|audible now)|hello,? ?(is )?(anyone|anybody) there|(can'?t|cannot|unable to) hear (you|anything|sound)|no sound|i'?m audible|i am audible|(you|u) (are|'?re) (breaking up|cutting out|muffled)|((your|the|my) )?(audio|voice|sound|mic|microphone|connection)s? ?(is|are|keeps?)? ?(fluttering|flickering|breaking|cutting|choppy|lagging|laggy|robotic|muffled|distorted|glitching|stuttering|unclear|not clear|bad|poor|gone|broken|not working|not audible))\b/i;

/**
 * They are asking for a moment to think.
 *
 * A hard system-design question deserves a pause, and saying so out loud is
 * what a candidate actually does. Graded as an answer it is a terrible one —
 * "let me think" scores near zero on every axis and burns a question. A human
 * panel says "take your time" and waits.
 */
/**
 * The longest an utterance can be and still be nothing but a request for time.
 *
 * Every phrasing in THINKING is under thirty characters on its own. Past forty
 * there is a sentence attached, and a sentence attached to "let me think" is
 * the candidate thinking out loud — which is an answer.
 */
const THINKING_MAX = 40;

const THINKING =
  /\b(let me think|give me a (second|moment|minute)|hold on|one (second|moment|minute)|i need a (second|moment|minute)|let me (gather|collect) my thoughts|thinking(\s+about (it|that))?|bear with me|just a (sec|second|moment))\b/i;

/**
 * The candidate telling us we put words in their mouth.
 *
 * Speech-to-text turns "what to do about the bug" into "what to on the bot",
 * and a panel that takes the transcript literally will then ask three questions
 * about a bot that never existed. One real interview went exactly that way: the
 * candidate said "I didn't talk about what, ma'am", was asked about the bot
 * again, said "I didn't talk about bot", and was asked a third time. Three of
 * his eight turns went on defending himself against a mis-hearing.
 *
 * A denial is not an answer and must not cost a turn. It also has to reach the
 * panel — see model.notePremiseDenied — because the correction is useless if
 * the next question carries on from the same invented premise.
 */
const CORRECTION =
  /\b(i (did ?n[o']?t|never) (say|said|talk about|mention|meant?)|(that'?s|thats) not what i (said|meant)|i (said|meant) something else|you (misheard|mis-heard|got that wrong)|no,? i (did ?n[o']?t|never))\b/i;

/**
 * The candidate asking for the interview to stop.
 *
 * There was no way to say this. One candidate asked five ways over fifty
 * seconds — "let's end the interview right now", "no, no, let's end", "no, no,
 * end", "I said stop" — and every one of them was graded as an answer, so the
 * panel replied with another question each time, including one asking whether
 * it should hand back to the hiring manager to wrap up the admin steps. The
 * interview only stopped when the candidate closed the tab.
 *
 * Honoured on the first ask, with no "are you sure": asking a person who has
 * said stop to confirm it is what produced the loop. The room's normal close
 * still writes the scorecard from whatever was said.
 */
const END =
  /^\s*(no[\s.,!?]*)*(stop|end|cancel|quit)[\s.,!?]*$|\b((let'?s|lets|let us|can we|could we|i want to|i wanna|i'?d like to|i would like to|please|shall we) (end|stop|finish|cancel|quit|leave|exit|wrap (this |it )?up)|(end|stop|cancel|quit|leave|exit) (the |this )?(interview|call|session|meeting|round)|i (said|say) (stop|end)|i'?m (leaving|dropping off|logging off)|end it (here|now)|stop it (here|now)|stop here|(that'?s|thats) enough|hang up|disconnect me|no more questions)\b/i;

/** They want something repeated or explained before they can answer. */
const CLARIFY =
  /\b((can|could|should|may) (you|i) (please )?repeat|can you say that again|could you (say that again|clarify|rephrase)|say (that|it) again|repeat (that|it|the question)|come again|sorry,? what|what was (that|the question)|i did ?n[o']?t (catch|hear|get) that|pardon)\b/i;

/**
 * A short utterance that opens like a question and ends like one.
 *
 * The candidate asking the panel something is not an answer, and the phrasings
 * are endless — a real interview produced "Can I repeat?" and "What is the
 * Vietnam transfer?" within a minute of each other, and both were graded as
 * answers. The second is the worse case: the candidate was querying a name that
 * speech-to-text had mangled out of their own words, and the panel spent a turn
 * treating that confusion as a claim about their career.
 *
 * Anchored on an opening interrogative so it cannot swallow a terse real answer
 * — "So, microservices?" is not a question the candidate is asking us.
 */
const BARE_QUESTION =
  /^(what|who|whom|which|where|when|why|how|can|could|should|would|shall|may|is|are|was|were|do|does|did|sorry|pardon|excuse)\b[^?]{0,70}\?\s*$/i;

/**
 * The whole utterance is a greeting or a sound check and nothing else.
 *
 * Anchored on purpose. "Testing" alone is a mic check; "I was testing the
 * pipeline" is an answer, and a loose \btesting\b would swallow it. "Hi" is not
 * an introduction either — treating it as one burns the introduction turn on a
 * single syllable.
 */
const BARE_CHECK =
  /^\s*((hi|hey|hello|yo|namaste|good (morning|afternoon|evening)|testing|test|mic test|audio test|check|wait|one|two|three|1|2|3)[\s.,!?]*)+$/i;

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

/** Meta pacing remarks when panelists talk over each other or candidate asks for one by one. */
const PACING =
  /\b((ask|speak|go|talk) (one by one|one at a time)|one by one|one at a time|wait wait|stop talking (together|at once)|don'?t speak together|too fast|can you ask one by one)\b/i;

export function classify(text: string): UtteranceKind {
  const t = text.trim();
  if (!t) return 'answer'; // The empty case is handled before this, in the route.

  // Long enough to be a real answer, whatever words are in it.
  if (t.length > SHORT) return 'answer';

  if (AUDIO_CHECK.test(t) || BARE_CHECK.test(t)) return 'audio-check';
  if (PACING.test(t)) return 'clarify';

  // They have asked to stop. Nothing else about the utterance matters, and
  // nothing below this line gets to talk them out of it.
  if (END.test(t)) return 'end';

  // "Okay, sir." is the candidate waiting, not answering. Handing the question
  // back is what a panel does — and it costs neither a turn nor an LLM call.
  // Before everything else: if they are telling us we misheard them, nothing
  // else about the utterance matters.
  if (CORRECTION.test(t)) return 'correction';

  if (BARE_ACK.test(t) && !SOLE_YES_NO.test(t)) return 'clarify';
  // Clarify before thinking: "give me a second" is a pause, but "could you say
  // that again, give me a second" is really a request to repeat.
  if (CLARIFY.test(t)) return 'clarify';
  // Thinking phrases are short by nature, and the cap is what stops one from
  // swallowing the answer that follows it. "Sorry, I was thinking. We stored the
  // tag as a column on the users table." is an answer that happens to open with
  // an apology, and it was being waved off with "Take your time."
  if (t.length <= THINKING_MAX && THINKING.test(t)) return 'thinking';

  // After the named phrasings, catch the shape itself: a short question the
  // candidate put to the panel. Handing the question back costs a sentence;
  // grading it costs them a turn and earns them a non-sequitur.
  if (BARE_QUESTION.test(t)) return 'clarify';

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
  // Never hand the question back here — the question is the problem. Repeating
  // it is how a panel asks about the same imaginary bot a third time.
  if (kind === 'correction') {
    return 'Apologies — I misheard you there. Let us leave that; carry on from what you were actually describing.';
  }

  // No confirming question back. "Do you want us to stop?" is how the panel
  // spent four more turns on a candidate who had already said stop twice.
  if (kind === 'end') {
    return 'Understood — we will stop the interview here. Thank you for your time, and all the best.';
  }

  if (kind === 'audio-check') {
    return lastQuestion
      ? `We can hear you clearly. Let me repeat: ${lastQuestion}`
      : 'Yes, we can hear you clearly. Whenever you are ready, go ahead and introduce yourself.';
  }

  // Short on purpose. They asked for silence to think in, so the worst thing
  // the panel can do is fill it.
  if (kind === 'thinking') return 'Take your time.';

  // Repeating the actual question beats "could you elaborate" — the candidate
  // asked because they lost it, so give it back to them verbatim.
  return lastQuestion
    ? `Of course. Let us take it one at a time: ${lastQuestion}`
    : 'Of course — take your time and tell us a little about yourself to start.';
}
