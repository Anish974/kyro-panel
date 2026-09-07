// Run: npm run check -w server
//
// The panel does something different every time the candidate says nothing.
//
// Agora posts a turn on silence as well as on speech, and every one of those
// used to get the same sentence back, however many came in a row: "Sorry, I
// didn't catch that — could you say it again?" Said to a candidate who is
// thinking, it interrupts them to report a problem that does not exist. Said to
// one who has run out of things to say, it asks them to repeat something they
// never said — and then asks again. The only way out of that loop was Agora's
// ninety-second idle timeout taking the whole panel with it.
//
// Three steps, in order: hand the question back, offer to move on, move on.

import assert from 'node:assert';
import express from 'express';
import type { AddressInfo } from 'node:net';

process.env.ORCHESTRATOR_API_KEY = 'silence-check';

const llmRoutes = (await import('../routes/llm.js')).default;
const eventRoutes = (await import('../routes/events.js')).default;
const model = await import('../panel/model.js');

const app = express();
app.use(express.json());
app.use(eventRoutes);
app.use(llmRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

model.reset(true);
model.setProfile({ name: 'Nidhi', role: 'Full-Stack Engineer', level: 'Intern' });

/** What the panel says back to one turn from Agora. */
const say = async (text: string): Promise<string> => {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: text }] }),
  });
  const body = await res.text();
  // The words are streamed one chunk each; glue them back into a sentence.
  return body
    .split('\n')
    .filter(l => l.startsWith('data:') && l.includes('"content"'))
    .map(l => JSON.parse(l.slice(5)).choices[0].delta.content)
    .join('')
    .trim();
};

// Something to have been asked, so there is a question to hand back.
await say('I built an employment system for unpaid interns during my internship.');
const asked = [...model.getModel().transcript].reverse().find(t => t.speaker !== 'candidate')!.text;
const turnsBefore = model.getModel().turns;

// 1. The first silence hands the question back rather than reporting a fault.
const first = await say('');
assert.ok(/take your time/i.test(first), `first silence must not rush them, got "${first}"`);
assert.ok(first.includes(asked), 'and it repeats the question they were asked');
assert.ok(!/didn't catch|did not catch/i.test(first), 'the candidate said nothing — nothing was mis-heard');

// 2. The second offers the way out, instead of asking again.
const second = await say('');
assert.ok(/move on/i.test(second), `second silence must offer to move on, got "${second}"`);
assert.notEqual(second, first, 'and it must not be the same sentence twice');

// 3. The third actually moves on — a new question, from someone else.
const third = await say('');
assert.ok(third.includes('?'), `moving on means asking something, got "${third}"`);
assert.notEqual(third, asked, 'and it is a different question, not the one they could not answer');
const spoke = [...model.getModel().transcript].reverse().find(t => t.speaker !== 'candidate')!;
assert.ok(third.includes(spoke.text), 'the question the panel moved on with is in the transcript');

// None of it costs the candidate a turn. They did not take one.
assert.equal(
  model.getModel().turns,
  turnsBefore,
  'silence must not spend a question out of the budget',
);

// 4. Saying anything at all puts the ladder back to the bottom.
await say('Sorry, I was thinking. We stored the tag as a column on the users table.');
const afterSpeaking = await say('');
assert.ok(
  /take your time/i.test(afterSpeaking),
  `a candidate who spoke starts again at the first step, got "${afterSpeaking}"`,
);

server.close();

console.log('silence  first, the question is handed back');
console.log('         second, the panel offers to move on');
console.log('         third, it moves on — and none of it costs a turn');
console.log('         and speaking again resets the ladder');
console.log('\nself-check passed');
