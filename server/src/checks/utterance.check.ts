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

// 3. Real answers. Including ones that contain the same words — this is the
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
assert.match(
  replyTo('clarify', null),
  /tell us a little about yourself/i,
  'with nothing asked yet, fall back to the opening ask',
);

console.log('utterance  audio checks and repeat requests never cost a turn');
console.log('           real answers survive, even when they quote the trigger words');
console.log('\nself-check passed');
