// Run: npm run check -w server
//
// One answer, one question back.
//
// Agora finalises ASR on a pause, not on a sentence, so it posts a turn every
// time the candidate draws breath — and each post carries the whole utterance
// so far. Read as separate answers, that is one paragraph getting three
// questions from three different panelists, and three of the ten turns spent on
// it. From a real transcript:
//
//   03:07  candidate  So I will have to learn as much thing as possible...
//   03:08  technical  Anish, thinking about a specific class project...
//   03:15  product    Anish, when you build that strong base...
//   03:17  hr         Anish, when you encounter a complex concept...
//
// and, earlier in the same interview, half a sentence answered twice:
//
//   00:27  candidate  Okay. So
//   00:29  hr         Take your time, Anish...
//   00:29  candidate  Okay. So I'm on a
//   00:31  hr         Take your time Anish, go ahead and finish your thought...
//
// The lines below are those utterances, verbatim.

import assert from 'node:assert';
import express from 'express';
import type { AddressInfo } from 'node:net';

const eventRoutes = (await import('../routes/events.js')).default;
const llmRoutes = (await import('../routes/llm.js')).default;
const { classify } = await import('../panel/utterance.js');
const model = await import('../panel/model.js');

const app = express();
app.use(express.json());
app.use(eventRoutes);
app.use(llmRoutes);

const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

/** Posts one ASR final, exactly as Agora does. Returns what the panel says. */
const said = async (text: string): Promise<string> => {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: text }] }),
  });
  const body = await res.text();
  assert.equal(res.status, 200, 'Agora must always get a well-formed answer');

  // Reassemble whatever words came back, if any.
  return body
    .split('\n')
    .filter(l => l.startsWith('data:') && l.includes('"content"'))
    .map(l => (JSON.parse(l.slice(5).trim()) as { choices: { delta: { content?: string } }[] })
      .choices[0].delta.content ?? '')
    .join('')
    .trim();
};

// --------------------------------------------- half a sentence is not an answer

assert.equal(classify('Okay. So'), 'thinking', 'a fragment ending on a conjunction is not an answer');
assert.equal(classify("Okay. So I'm on a"), 'thinking', 'nor is one ending on an article');
assert.equal(classify('I use a queue.'), 'answer', 'a short but finished sentence still is');
assert.equal(
  classify('We sharded by merchant id because hot merchants caused write locks.'),
  'answer',
  'and so is a real one',
);

// Brevity is not a fragment. These end on words that were in the dangling list
// once and cost real answers their turn.
assert.equal(classify('No, we never measured it.'), 'answer', 'a short finished sentence is an answer');
assert.equal(classify('I did not know that.'), 'answer', 'even when it ends on a pronoun');
assert.equal(classify('Yes it is.'), 'answer', 'or on a verb');

// --------------------------------------------------- one answer, one response

model.reset(true);
model.setProfile({ name: 'Anish', role: 'Backend Engineer', level: 'Intermediate (2-6 years)' });

const FIRST = 'So I will have to learn as much as possible in my coursework and build the base strong.';
const opening = await said(FIRST);
assert.ok(opening.length > 0, 'a finished answer gets a question back');
assert.equal(model.getModel().turns, 1, 'and costs exactly one turn');

// The same utterance again, further along. Agora sends the whole thing each
// time, so this is not a second answer — it is the first one, still arriving.
const GROWN = FIRST + ' And then I will move on to the advanced things.';
assert.equal(await said(GROWN), '', 'a continuation is answered with silence, not another question');
assert.equal(model.getModel().turns, 1, 'and costs no extra turn');
assert.equal(
  model.getModel().transcript.filter(t => t.speaker === 'candidate').pop()?.text,
  GROWN,
  'the fuller text supersedes the shorter one rather than sitting beside it',
);

const panelTurns = model.getModel().transcript.filter(t => t.speaker !== 'candidate').length;
assert.equal(panelTurns, 1, 'one paragraph, one panelist, one question');

// ------------------------------------- the same final, sent twice

// Agora re-sends a final it has already sent. `continues` refuses equal strings
// by design — nothing was added, so there is nothing to supersede — and that
// left a gap: an exact repeat looked like a brand new answer. Another turn out
// of the ten, a duplicate line in the transcript, and a second question about
// the answer just given. Straight from a real transcript, one second apart:
//
//   [178s] CANDIDATE: And the connection stays down. It will trigger the RTL...
//   [179s] CANDIDATE: And the connection stays down. It will trigger the RTL...
//
// followed by two questions from the same panelist. Read back later that is a
// candidate repeating himself and ignoring a question. He did neither.
const turnsBeforeRepeat = model.getModel().turns;
const panelBeforeRepeat = model.getModel().transcript.filter(t => t.speaker !== 'candidate').length;

assert.equal(await said(GROWN), '', 'an identical repeat is answered with silence');
assert.equal(model.getModel().turns, turnsBeforeRepeat, 'and costs no turn');
assert.equal(
  model.getModel().transcript.filter(t => t.speaker !== 'candidate').length,
  panelBeforeRepeat,
  'and earns no second question about the answer just given',
);

// ------------------------------------------- but silence is not forever

// Uncapped, the hold went badly the other way. A real answer arrived as six
// growing finals, every one after the first was swallowed, and the transcript
// ends with the candidate saying "Hello? Hello?" into a room that had stopped
// answering. These are those finals, verbatim.
const GROWING = [
  GROWN + ' Like telemetry,',
  GROWN + ' Like telemetry, logs,',
  GROWN + ' Like telemetry, logs, Hello?',
  GROWN + ' Like telemetry, logs, Hello? Hello?',
];

const replies: string[] = [];
for (const text of GROWING) replies.push(await said(text));

assert.ok(
  replies.some(r => r.length > 0),
  'a candidate who keeps talking must eventually be answered, not left in silence',
);
assert.ok(
  replies.filter(r => r.length > 0).length <= 2,
  'but the panel still must not answer every fragment',
);

const lastSaid = model.getModel().transcript.filter(t => t.speaker !== 'candidate').pop()!.text;

server.close();

console.log('floor  half a sentence is not an answer, and does not cost a turn');
console.log('       a growing ASR final is the same answer, not a new one');
console.log('       but a candidate who keeps talking is answered, not left in silence');
console.log('       an identical final resent by Agora costs no turn and no question');
console.log(`       one paragraph got one question back (last: "${lastSaid.slice(0, 40)}…")`);
console.log('\nself-check passed');
