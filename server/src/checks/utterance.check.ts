// Run: npm run check -w server
//
// This classifier decides whether something the candidate said costs them one
// of their ten questions. Get it wrong in one direction and "am I audible?"
// burns the introduction turn — which is exactly what happened, and the panel
// answered it by diving into the resume. Get it wrong in the other direction
// and a real answer gets waved off with "yes, we can hear you".
//
// Length is the guard that separates the two. These cases pin it.

import assert from 'node:assert';
import { classify, replyTo } from '../panel/utterance.js';

// 1. Logistics. None of these may reach the panel or move the turn counter.
for (const t of [
  'am I audible',
  'Am I audible?',
  'can you hear me',
  'Can you hear me?',
  'do you hear me',
  'is this working',
  'is my mic on',
  'mic check',
  'testing',
  'testing 1 2',
  'hello, is anyone there?',
  'Sir, you are not audible, sir. Hello.',
  "So you're not audible. Sir,",
  'you are not audible',
  'I cannot hear you',
  'cannot hear anything',
  'no sound',
]) {
  assert.equal(classify(t), 'audio-check', `"${t}" is logistics, not an answer`);
}

// A bare greeting is not an introduction. Treating "hi" as one spends the
// introduction turn on a single syllable.
for (const t of ['hi', 'Hello.', 'hey', 'Good morning']) {
  assert.equal(classify(t), 'audio-check', `"${t}" is a greeting, not an introduction`);
}

// 2. Clarifying questions. The candidate wants the question back, not a grade.
for (const t of [
  'can you repeat that',
  'could you say that again',
  'sorry, what?',
  'come again',
  "i didn't catch that",
  'what was the question',
  'could you rephrase',
]) {
  assert.equal(classify(t), 'clarify', `"${t}" is a clarifying question`);
}

// 3. Asking for a moment to think. A hard question deserves a pause, and
//    graded as an answer "let me think" scores near zero on every axis and
//    costs a question the candidate never got to use.
for (const t of [
  'let me think',
  'give me a second',
  'hold on',
  'one moment',
  'I need a minute',
  'let me gather my thoughts',
  'bear with me',
]) {
  assert.equal(classify(t), 'thinking', `"${t}" is a pause, not an answer`);
}

// "Take your time" and nothing else — the candidate asked for silence, so the
// worst thing the panel can do is fill it with words.
// A pause with an answer attached is an answer. The phrase is short by nature,
// so anything long enough to carry a sentence is the candidate thinking out
// loud — and "Sorry, I was thinking. We stored the tag as a column on the users
// table." was being waved off with "Take your time" instead of graded.
for (const t of [
  'Sorry, I was thinking. We stored the tag as a column on the users table.',
  'Let me think — we keyed it by tenant id so the writes stopped colliding.',
  'Give me a second. Actually no, we used a separate table for the unpaid users.',
]) {
  assert.equal(classify(t), 'answer', `"${t}" is an answer that opens with a pause`);
}

assert.match(replyTo('thinking', null), /take your time/i, 'a pause is granted, not questioned');
assert.ok(replyTo('thinking', 'Some question?').length < 40, 'and granted briefly');

// 4. Real answers. Including ones that contain the same words — this is the
//    failure that would quietly throw away a candidate's best turn.
for (const t of [
  'I have spent six years on payments infrastructure, mostly backend work on Postgres and Kafka.',
  'The on-call engineer would ping the bridge and ask can you hear me before we started the rollback, so we built a status page instead.',
  'We sharded by tenant.',
  'I led the migration.',
  'Yes.',
  'No, we never measured it.',
  // "testing" alone is a mic check, but only alone — a loose \btesting\b would
  // swallow every candidate who talks about testing, which is most of them.
  'I was testing the pipeline locally first.',
  'We had no integration testing at all.',
  'I check the dashboards every morning.',
]) {
  assert.equal(classify(t), 'answer', `"${t.slice(0, 40)}..." must be graded as an answer`);
}

// The length guard is the whole mechanism, so state it as a fact: anything past
// the cap is an answer no matter which words are in it.
const longWithTrigger = 'can you hear me '.repeat(10);
assert.ok(longWithTrigger.length > 80, 'fixture must exceed the short-utterance cap');
assert.equal(classify(longWithTrigger), 'answer', 'past the cap, wording stops mattering');

// 4. What the panel says back.
assert.match(
  replyTo('audio-check', null),
  /hear you/i,
  'an audio check gets confirmation, not a question',
);
assert.ok(
  !/resume|architecture|design/i.test(replyTo('audio-check', null)),
  'an audio check must never be answered with an interview question',
);

const question = 'Walk me through the write contention you hit on that ledger.';
assert.ok(
  replyTo('clarify', question).includes(question),
  'a repeat request gets the question back verbatim',
);
assert.ok(
  replyTo('audio-check', question).includes(question),
  'an audio check mid-interview repeats the last question',
);
assert.match(
  replyTo('clarify', null),
  /tell us a little about yourself/i,
  'with nothing asked yet, fall back to the opening ask',
);

// 5. A bare acknowledgement is the candidate waiting, not answering.
//
// These came out of one real interview and were all graded as answers. They
// spent three of its eleven turns, and they sit in the transcript directly
// under real questions — so the write-up read a candidate who answered "what
// data structure did you use" with the word "okay", and all three panelists
// marked him down for evasiveness he never showed.
for (const said of ['Yeah. Okay.', 'Okay, sir.', 'Okay sir. No problem. Continue.', 'Mhm', 'got it', 'Alright.']) {
  assert.notEqual(classify(said), 'answer', `"${said}" is not an answer and must not cost a turn`);
}

// A bare yes or no stays an answer — see the list above. "Did you measure it?"
// deserves to be answerable in one word, and dropping that would cost the
// candidate a turn they really did take.
for (const said of ['Yes.', 'No.', 'Yeah']) {
  assert.equal(classify(said), 'answer', `"${said}" answers a yes/no question`);
}

// And only when the acknowledgement is the WHOLE utterance. An answer that
// opens with one of these words is still an answer, and losing those would be
// far worse than the turn this saves.
for (const said of [
  'Okay, so we sharded by tenant id because hot tenants held locks.',
  'Right, the queue drains as soon as the socket reconnects.',
  'Yes, we measured it at about four thousand requests per second.',
  'Sure, the RTL fires after the reconnect window closes.',
]) {
  assert.equal(classify(said), 'answer', `"${said.slice(0, 40)}..." is a real answer`);
}

console.log('utterance  audio checks and repeat requests never cost a turn');
console.log('           real answers survive, even when they quote the trigger words');
console.log('           a bare "okay, sir" hands the question back instead of taking a turn');
console.log('\nself-check passed');
