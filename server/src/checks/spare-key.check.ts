// Run: npm run check -w server
//
// When the first API key is out of quota, the second one answers.
//
// Free-tier quota is counted per account, so retrying the same key after a wait
// gets the same 429 — a spare key on a second account is the only retry that
// changes the outcome. This mattered in production twice: the panel dropped to
// its canned keyword lines mid-interview and the candidate sat in silence long
// enough to ask "Hello? Hello?".
//
// Driven against a fake provider on loopback, so the switch is exercised for
// real rather than assumed.

import assert from 'node:assert';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const PRIMARY = 'primary-key';
const SPARE = 'spare-key';

/** Which keys the fake provider is currently refusing, and with what. */
let refuse: Record<string, number> = {};
const seen: string[] = [];

const provider = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    const key = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    seen.push(key);

    const status = refuse[key];
    if (status) {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: status, message: 'quota exceeded' } }));
      return;
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: `answered with ${key}` } }] }));
  });
});

await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve));
process.env.LLM_BASE_URL = `http://127.0.0.1:${(provider.address() as AddressInfo).port}/v1`;
process.env.LLM_MODEL = 'spare-check';
process.env.LLM_API_KEY = PRIMARY;
process.env.LLM_API_KEY_FALLBACK = SPARE;

const { ask, LLM_ENABLED } = await import('../panel/llm.js');
assert.ok(LLM_ENABLED, 'a configured primary key means the panel is live');

const askOnce = async () => {
  seen.length = 0;
  return ask('system', 'user', 20);
};

// 1. Nothing wrong: the spare is never touched.
refuse = {};
assert.equal(await askOnce(), `answered with ${PRIMARY}`, 'the primary answers when it can');
assert.deepEqual(seen, [PRIMARY], 'and the spare is left alone');

// 2. Out of quota: the spare answers, and the interview carries on.
refuse = { [PRIMARY]: 429 };
assert.equal(await askOnce(), `answered with ${SPARE}`, 'a 429 on the primary must not reach the panel');
assert.deepEqual(seen, [PRIMARY, SPARE], 'the primary is tried first, then the spare');

// 3. The provider itself is down — same move, a second account may be routed
//    elsewhere, and it costs one request to find out.
refuse = { [PRIMARY]: 503 };
assert.equal(await askOnce(), `answered with ${SPARE}`, 'a 5xx is worth the spare too');

// 4. Both out: the caller is told, and falls back to keywords as it always did.
refuse = { [PRIMARY]: 429, [SPARE]: 429 };
await assert.rejects(askOnce(), /LLM 429/, 'when both are spent the panel still degrades honestly');

// 5. A bad request is not a quota problem. Spending the spare on it would burn
//    the one thing standing between a real 429 and a canned reply.
refuse = { [PRIMARY]: 400 };
await assert.rejects(askOnce(), /LLM 400/, 'a 400 fails outright');
assert.deepEqual(seen, [PRIMARY], 'without touching the spare');

provider.close();

console.log('spare  a 429 or 5xx on the primary key is answered by the second account');
console.log('       a 400 is not — the spare is for quota, not for bad requests');
console.log('       both spent still degrades to keywords rather than hanging');
console.log('\nself-check passed');
