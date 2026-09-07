// Run: npm run check -w server
//
// A real interview, kept verbatim because the panel spent three of the
// candidate's eight turns interrogating him about something he never said.
//
//   03:30  hii:   ...ask them what to on the bot that is what was the problem
//   03:32  Arjun: I didn't quite catch what you meant by the bot there—could
//                 you explain how that bot is set up and what data it processes?
//   04:10  Ananya: Let's see how this bot actually impacts the end user once it
//                  processes that data.
//   04:22  hii:   I didn't talk about what, ma'am.
//   04:23  Arjun: could you walk me through the main programming language and
//                 libraries you used to build that bot?
//   04:40  hii:   I didn't talk about bot
//
// "ask them what to do about the bug" reached us as "ask them what to on the
// bot". Two separate failures then compounded it. The denials were graded as
// answers, so each one cost a turn and told the panel nothing. And Ananya's
// line asks nothing at all — it is almost word for word the example the prompt
// already gives as forbidden, which is why the candidate answered it with "I
// didn't talk about what, ma'am".

import assert from 'node:assert';
import { classify, replyTo } from '../panel/utterance.js';
import * as model from '../panel/model.js';

// --- a denial is not an answer ----------------------------------------------

const denials = [
  "I didn't talk about bot",
  "I didn't talk about what, ma'am.",
  'I never said that',
  "That's not what I said",
  'No, I never mentioned that',
  'You misheard me',
];
for (const line of denials) {
  assert.equal(classify(line), 'correction', `"${line}" is a correction and must cost no turn`);
}

// Something that merely contains a negation is still an answer.
for (const line of [
  'We used Redis because writes were blocking on the primary.',
  'I did not have time to add caching, so reads hit the database directly.',
]) {
  assert.equal(classify(line), 'answer', `"${line}" is an answer`);
}

// --- and the reply must not hand the bad question back ----------------------

// This is the trap the clarify path would fall into: repeating the question is
// exactly how the panel asked about the bot a third time.
const reply = replyTo('correction', 'Could you explain how that bot is set up?');
assert.ok(!/bot/i.test(reply), 'the reply must not repeat the premise it just got wrong');
assert.ok(reply.length > 20, 'and it still says something to the candidate');

// --- the denial reaches the next turn ---------------------------------------

// Without this the correction goes nowhere: the route answers it without
// running the panel, so the panel would never learn the premise was denied.
model.reset(true);
assert.equal(model.takePremiseDenied(), false, 'nothing denied yet');
model.notePremiseDenied();
assert.equal(model.takePremiseDenied(), true, 'the next turn is warned');
assert.equal(model.takePremiseDenied(), false, 'and only that turn — the warning is not sticky');

model.notePremiseDenied();
model.reset();
assert.equal(model.takePremiseDenied(), false, 'a reset clears it with the rest of the session');

// --- a reply that asks nothing is not a turn --------------------------------

// Enforced in coerce() rather than only in the prompt, because the prompt has
// forbidden it in capitals for a while and the model produced it anyway.
const source = await (await import('node:fs/promises')).readFile(
  new URL('../panel/bidding.ts', import.meta.url),
  'utf8',
);
assert.ok(
  source.includes("includes('?')"),
  'a drafted reply with no question in it must be rejected in code, not just discouraged in the prompt',
);
assert.ok(
  source.includes('!model.shouldConclude()'),
  'except on the closing turn, where a goodbye is not supposed to be a question',
);

console.log('denial  "I didn\'t talk about bot" is a correction, not an answer');
console.log('        the reply drops the premise instead of repeating it');
console.log('        and the next turn is told to drop it too');
console.log('        a reply that asks nothing is rejected in code');
console.log('\nself-check passed');
