// Run: npm run check -w server
//
// A turn is two LLM calls now — bids, then the winner's line streamed token by
// token — and the whole point is that the first words leave before the last
// ones exist. That is not something the other checks can see: they run with no
// key, on the keyword path, where a reply is just a string.
//
// So this one stands up an OpenAI-compatible server on loopback and drives a
// real turn through it. No external network, no key, no cost — but the SSE
// parser, the two-phase split and the "deltas spell out the reply" contract
// are all exercised for real.

import assert from 'node:assert';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const BIDS = JSON.stringify({
  technical: { score: 0.4, reason: 'queue design worth probing', intent: 'probe', quality: 0.6 },
  product: { score: 0.95, reason: 'no customer angle', intent: 'challenge', quality: 0.5 },
  hr: { score: 0.2, reason: 'nothing to own yet', intent: 'followup', quality: 0.5 },
});

// Deliberately fragmented mid-word and mid-sentence, the way a real model
// streams — a parser that only works on whole words would pass otherwise.
const FRAGMENTS = [
  'A two-second delay ',
  'on checkout is a ref',
  'und ticket. How did you ',
  'decide that trade was acceptable?',
];

/** The candidate's answer: technical, and with no mention of a customer. */
const ANSWER = 'We put a payment queue in front of Redis so writes never block.';

let bidCalls = 0;
let streamCalls = 0;

const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    const streaming = (JSON.parse(body) as { stream?: boolean }).stream === true;

    if (!streaming) {
      bidCalls++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: BIDS } }] }));
      return;
    }

    streamCalls++;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    let i = 0;
    const tick = setInterval(() => {
      if (i < FRAGMENTS.length) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: FRAGMENTS[i++] } }] })}\n\n`);
        return;
      }
      clearInterval(tick);
      res.write('data: [DONE]\n\n');
      res.end();
    }, 30);
  });
});

await new Promise<void>(resolve => fake.listen(0, '127.0.0.1', resolve));
const { port } = fake.address() as AddressInfo;

// llm.ts reads these once, at import. They have to be set before it loads,
// which is why the panel is imported dynamically below and not at the top.
process.env.LLM_BASE_URL = `http://127.0.0.1:${port}/v1`;
process.env.LLM_MODEL = 'stream-check';
process.env.LLM_API_KEY = 'stream-check';

const { runPanel } = await import('../panel/bidding.js');
const model = await import('../panel/model.js');

model.reset();

const started = Date.now();
let floorAt = -1;
let firstWordAt = -1;
const deltas: string[] = [];

const decision = await runPanel(ANSWER, {
  onFloor: () => {
    floorAt = Date.now() - started;
  },
  onReplyDelta: text => {
    if (firstWordAt < 0) firstWordAt = Date.now() - started;
    deltas.push(text);
  },
});

const finishedAt = Date.now() - started;

assert.equal(bidCalls, 1, `the panel bids exactly once, got ${bidCalls} calls`);
assert.equal(streamCalls, 1, `only the winner writes a line, got ${streamCalls} calls`);
assert.equal(decision.winner, 'product', `product should win, got ${decision.winner}`);

// The floor has to be settled before a single word of the reply exists —
// otherwise the voice cannot be chosen in time and the wrong panelist speaks.
assert.ok(floorAt >= 0, 'onFloor must fire');
assert.ok(floorAt <= firstWordAt, `floor (${floorAt}ms) must be decided before the first word (${firstWordAt}ms)`);

// The whole reason for streaming: speaking starts long before writing ends.
assert.ok(firstWordAt < finishedAt, `first word (${firstWordAt}ms) must land before the turn ends (${finishedAt}ms)`);
assert.ok(deltas.length > 1, 'the reply must arrive in pieces, not all at once');

// routes/llm.ts relies on this exactly: if any delta fired, it writes nothing
// more and trusts that what it forwarded IS the turn. A mismatch here means the
// transcript and the audio disagree.
assert.equal(deltas.join('').trim(), decision.reply, 'the deltas must spell out the returned reply');
assert.equal(
  model.getModel().transcript.at(-1)!.text,
  decision.reply,
  'the transcript records the line that was actually spoken',
);

fake.close();

console.log('stream  bids and reply are separate calls, floor decided first');
console.log(`        first word at +${firstWordAt}ms, turn done at +${finishedAt}ms`);
console.log('        streamed fragments reassemble into the recorded turn');
console.log('\nself-check passed');
