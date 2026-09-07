// Run: npm run check -w server
//
// The candidate can stop the interview.
//
// Reconstructed from a real session. Over its last fifty seconds the candidate
// said "let's end the interview right now", "no, no, let's end", "no, no, end"
// and "I said stop" — and got four more questions back, one of which asked
// whether the panel should hand over to the hiring manager to wrap up the admin
// steps. Nothing in the classifier could express "stop", so every one of those
// was graded as an answer and answered with a question.
//
// This drives the real route, because the fix is only worth anything if the
// room hears 'concluded' — that event is what starts the leave timer and the
// scorecard fetch, and without it a goodbye is just more talking.

import assert from 'node:assert';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { classify } from '../panel/utterance.js';

process.env.ORCHESTRATOR_API_KEY = 'end-intent-check';

const eventRoutes = (await import('../routes/events.js')).default;
const llmRoutes = (await import('../routes/llm.js')).default;
const model = await import('../panel/model.js');

// 1. The words themselves. Every line here is one the candidate actually said.
for (const t of [
  "Let's end the interview right now.",
  'No. No. Let us end.',
  'No. No. End.',
  'I said stop.',
  'Stop.',
  'stop the interview',
  'can we stop here',
  'I want to end this call',
  "that's enough",
]) {
  assert.equal(classify(t), 'end', `"${t}" is the candidate asking to stop`);
}

// 2. And a real answer that happens to contain those words is still an answer.
// This is the guard that keeps the pattern above from eating the interview.
for (const t of [
  'We stop the retry loop after three attempts and push the job to a dead letter queue.',
  'No.',
  'Yes.',
  'The migration ended up taking a full weekend because of the index rebuild.',
]) {
  assert.equal(classify(t), 'answer', `"${t}" is an answer, not a request to stop`);
}

// 3. The audio complaints that went through as answers in that same session.
for (const t of [
  'Your audio is fluttering.',
  'Total audios fluttering.',
  'your voice is breaking',
  'you are breaking up',
  "I'm audible.",
  'Hello. Hello. Hello. Wait. Hello. Hello.',
]) {
  assert.equal(classify(t), 'audio-check', `"${t}" is logistics, not an answer`);
}

// 4. End to end: one request to stop closes the interview, once.
const app = express();
app.use(express.json());
app.use(eventRoutes);
app.use(llmRoutes);

const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

model.reset(true);
model.setProfile({ name: 'Anish Patankar', role: 'Full-Stack Engineer', level: 'Intern' });

const control = new AbortController();
const events: string[] = [];
const stream = await fetch(`${base}/events`, { signal: control.signal });
const reader = stream.body!.getReader();
const decoder = new TextDecoder();
void (async () => {
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      for (const line of decoder.decode(value, { stream: true }).split('\n')) {
        if (line.startsWith('data:')) events.push(line.slice(5).trim());
      }
    }
  } catch {
    // The abort at the end is how this stops.
  }
})();

const say = async (text: string): Promise<string> => {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: text }] }),
  });
  return res.text();
};

const spoken = await say("Let's end the interview right now.");
assert.ok(!spoken.includes('?'), 'the panel must not answer a request to stop with a question');
await new Promise(r => setTimeout(r, 50));

assert.equal(
  events.filter(e => e.includes('"type":"concluded"')).length,
  1,
  'the room must be told the interview concluded, or the call never ends',
);
assert.equal(model.getModel().turns, 0, 'asking to stop must not cost the candidate a turn');

// The candidate says it again, the way they did four more times. The room
// restarts its leave timer on every 'concluded' it hears, so a second one here
// would mean the call the candidate is trying to leave stays open.
for (const again of ['No. No. End.', 'I said stop.']) await say(again);
await new Promise(r => setTimeout(r, 50));

assert.equal(
  events.filter(e => e.includes('"type":"concluded"')).length,
  1,
  'the panel concludes once, however many times it is asked',
);

control.abort();
server.close();

console.log('end       "let us end the interview" is a request, not an answer');
console.log('          the room is told once, so its leave timer runs');
console.log('          and it costs the candidate no turn');
console.log('\nself-check passed');
