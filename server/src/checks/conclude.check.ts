// Run: npm run check -w server
//
// The panel says goodbye once.
//
// It used to say it five times. The condition was `turns >= CONCLUDE_AT_TURN`,
// so every turn after the tenth broadcast another `concluded` — and the room
// starts its leave timer off that event, so each new one cancelled the timer
// that was about to end the call. The interview never closed, and the candidate
// sat through the same farewell on a loop.
//
// Neither half fails loudly: the server is "correct" (the interview really has
// concluded), and the room is "correct" (it really should restart a timer when
// the value it depends on changes). Only the two together are wrong, which is
// why this drives the real route and counts what a browser would receive.

import assert from 'node:assert';
import express from 'express';
import type { AddressInfo } from 'node:net';

process.env.ORCHESTRATOR_API_KEY = 'conclude-check';

const eventRoutes = (await import('../routes/events.js')).default;
const llmRoutes = (await import('../routes/llm.js')).default;
const model = await import('../panel/model.js');

const app = express();
app.use(express.json());
app.use(eventRoutes);
app.use(llmRoutes);

const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

model.reset(true);
model.setProfile({ name: 'Ada Lovelace', role: 'Backend Engineer', level: 'Intermediate (2-6 years)' });

// Read after setProfile, because the budget is derived from the length that
// session was booked for.
const CONCLUDE_AT_TURN = model.concludeAtTurn();

// Watch the room's feed, exactly as the browser does.
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

/** One candidate answer, distinct enough each time to count as a new turn. */
const say = async (n: number) => {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: `We sharded partition ${n} by tenant id to spread the write locks.` }],
    }),
  });
  await res.text();
};

// Past the turn budget, with the whole booked slot still ahead. The panel is
// meant to keep probing here rather than close — a candidate who answers ten
// questions in four minutes of a ten-minute booking has earned deeper
// questions, not an early goodbye.
const OVERRUN = CONCLUDE_AT_TURN + 4;
for (let n = 1; n <= OVERRUN; n++) await say(n);
await new Promise(r => setTimeout(r, 50));

assert.equal(model.getModel().turns, OVERRUN, 'every answer must have counted as a turn');
assert.equal(
  events.filter(e => e.includes('"type":"concluded"')).length,
  0,
  'the turn budget alone must not end the interview while the booked time remains',
);

// Now the booked time runs out. The next answer is the one the panel closes on.
model.setSimulatedElapsed(model.durationMin() * 60);
await say(OVERRUN + 1);
await new Promise(r => setTimeout(r, 50));

assert.equal(
  events.filter(e => e.includes('"type":"concluded"')).length,
  1,
  'the panel closes when the booked duration is spent',
);

// And it stays closed. The room restarts its leave timer on every one of these,
// so a second announcement means the call never ends — that is the bug this
// file exists for, and the clock stays expired from here on.
for (let n = 0; n < 4; n++) await say(OVERRUN + 2 + n);
await new Promise(r => setTimeout(r, 50));

const concluded = events.filter(e => e.includes('"type":"concluded"'));
assert.equal(
  concluded.length,
  1,
  `the panel concludes once, not ${concluded.length} times — the room cancels its own leave timer on each repeat`,
);
model.setSimulatedElapsed(null);

control.abort();
server.close();

console.log('conclude  the turn budget alone does not close the interview');
console.log('          the booked duration does, exactly once');
console.log(`          still once after ${OVERRUN + 5} turns, so the room's leave timer survives`);
console.log('\nself-check passed');
