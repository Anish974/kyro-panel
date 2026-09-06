// Run: npm run check -w server
//
// The redirect is a hiring recommendation about a real person, made by a model,
// on a page a recruiter acts from. Two things make it safe to show, and both are
// guardrails rather than prompt wording — a prompt asks, a guardrail refuses:
//
//   1. It may only name a role the company actually has open. A plausible role
//      nobody is hiring for reads like an offer with nothing behind it.
//   2. It must quote the candidate verbatim. "Seemed more infra-shaped" is not
//      a reason a hiring manager can check, and not one the candidate could
//      ever contest.
//
// Driven against a fake LLM on loopback, so the refusals are exercised for real
// rather than hoped for.

import assert from 'node:assert';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/** What the fake model answers with next. Set per case. */
let reply = '{}';

const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: reply } }] }));
  });
});

await new Promise<void>(resolve => fake.listen(0, '127.0.0.1', resolve));
process.env.LLM_BASE_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}/v1`;
process.env.LLM_MODEL = 'redirect-check';
process.env.LLM_API_KEY = 'redirect-check';

const { suggestRole } = await import('../panel/redirect.js');
const model = await import('../panel/model.js');

const SAID_FIRST = 'I spent most of last year on the deploy pipeline and the on-call rotation, not on features.';
const SAID_SECOND = 'Honestly the product side never really grabbed me the way the infrastructure did.';

model.reset(true);
model.setProfile({ name: 'Ada Lovelace', role: 'Product Engineer', level: 'Intermediate (2-6 years)' });
model.addTurn({ speaker: 'candidate', text: SAID_FIRST });
model.addTurn({ speaker: 'candidate', text: SAID_SECOND });

const OPEN = ['Platform Engineer', 'Site Reliability Engineer'];

// 1. A role nobody is hiring for is refused, however good the reasoning reads.
reply = JSON.stringify({
  role: 'Head of Infrastructure',
  reason: 'They clearly love infrastructure.',
  quote: SAID_FIRST,
});
assert.equal(
  await suggestRole('Product Engineer', OPEN),
  null,
  'a role outside the open list must be dropped, not passed through',
);

// 2. A quote the candidate never said is refused, even for a real role. This is
//    the anti-hallucination gate: the model paraphrases constantly.
reply = JSON.stringify({
  role: 'Platform Engineer',
  reason: 'Strong infrastructure instincts.',
  quote: 'I have always seen myself as a platform person at heart.',
});
assert.equal(
  await suggestRole('Product Engineer', OPEN),
  null,
  'a quote that is not in the transcript must take the suggestion down with it',
);

// 3. A real role with real words gets through — and what comes back is the
//    transcript's own text and timestamp, not the model's copy of it.
reply = JSON.stringify({
  role: 'platform engineer',
  reason: 'Spent the year on deploy tooling and on-call rather than product work.',
  quote: 'the deploy pipeline and the on-call rotation',
});
const ok = await suggestRole('Product Engineer', OPEN);
assert.ok(ok, 'a real role backed by real words must be suggested');
assert.equal(ok.role, 'Platform Engineer', 'the role is returned as the company spelled it, not as the model did');
assert.equal(ok.evidence.quote, SAID_FIRST, 'the evidence is the transcript turn, not the fragment the model sent');
assert.equal(typeof ok.evidence.t, 'number', 'and carries the moment it was said');
assert.ok(ok.reason.length > 0 && ok.reason.length <= 240, 'the reason is present and capped');

// 4. Nothing open, nothing to suggest — and no call made to find that out.
assert.equal(await suggestRole('Product Engineer', []), null, 'no open roles means no suggestion');
assert.equal(
  await suggestRole('Product Engineer', ['Product Engineer']),
  null,
  'the role they already interviewed for is not a redirect',
);

// 5. A candidate who barely spoke cannot be redirected on evidence that does
//    not exist. This is the interview that ended in the first minute.
model.reset();
model.addTurn({ speaker: 'candidate', text: 'Hello, can you hear me?' });
reply = JSON.stringify({ role: 'Platform Engineer', reason: 'Vibes.', quote: 'Hello, can you hear me?' });
assert.equal(
  await suggestRole('Product Engineer', OPEN),
  null,
  'one turn is not enough to redirect a career on',
);

fake.close();

console.log('redirect  only names a role the company actually has open');
console.log('          only speaks with a quote the candidate really said');
console.log('          stays silent on a short interview, or with nothing else open');
console.log('\nself-check passed');
