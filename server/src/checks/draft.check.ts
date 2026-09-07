// Run: npm run check -w server
//
// The floor goes to a panelist who actually has a question.
//
// The model sometimes answers for one panelist and not the others — the log
// line is "product returned no usable bid — keywords for this one only". Those
// panelists fall back to the keyword scorer, and that scorer has a 0.95 spike
// for an answer with no customer impact in it. A real LLM draft scoring 0.5
// loses to it.
//
// So on a partially-successful turn, the panelist WITHOUT a question won the
// floor and read a line off the canned fallback list. In production a candidate
// heard "If you had to ship half of that, which half would you keep?" while two
// usable questions sat unused.

import assert from 'node:assert';
import { PANEL } from '@kyro/shared';

// A fake provider that bids for two panelists and skips the third, exactly as
// the real one does when a turn comes back partly filled in.
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const SKIPS_PRODUCT = JSON.stringify({
  bids: {
    technical: { score: 0.5, reason: 'wants the implementation detail', intent: 'probe', quality: 0.5 },
    // product is missing. coerceBid() drops it and the keyword scorer fills in,
    // which is where the 0.95 spike comes from.
    hr: { score: 0.3, reason: 'no ownership yet', intent: 'followup', quality: 0.4 },
  },
  floor: 'technical',
  reply: 'What backs that queue, and what happens when it fills up?',
});

const provider = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: SKIPS_PRODUCT } }] }));
  });
});

await new Promise<void>(r => provider.listen(0, '127.0.0.1', r));
process.env.LLM_BASE_URL = `http://127.0.0.1:${(provider.address() as AddressInfo).port}/v1`;
process.env.LLM_MODEL = 'draft-check';
process.env.LLM_API_KEY = 'draft-check';

const { runPanel } = await import('../panel/bidding.js');
const model = await import('../panel/model.js');

model.reset(true);
model.setProfile({ name: 'Yash', role: 'Full-Stack Engineer', level: 'Intern' });

// Technical with no customer angle — the exact shape that spikes product to
// 0.95 on the keyword scorer, which is how it used to steal the floor.
const decision = await runPanel('So I am using a map queue and table dataset models, and MongoDB for unstructured data.');

assert.equal(decision.winner, 'technical', 'the floor goes where the model put it, not to the keyword spike');
assert.equal(
  decision.reply,
  'What backs that queue, and what happens when it fills up?',
  'and the candidate hears that question, not a canned line',
);

// Every panelist still bids — the tiles in the room are driven off this, and a
// missing draft must not make someone vanish from the panel.
assert.equal(decision.bids.length, PANEL.length, 'all three still bid');

const canned = decision.bids.find(b => b.panelist === 'product');
assert.ok(canned, 'product still bids from keywords');
assert.ok(canned.score >= 0.9, 'and still bids high — the spike is real, it just no longer wins');

provider.close();

console.log('draft  a keyword spike does not steal the floor the model named');
console.log('       all three still bid, so nobody disappears from the room');
console.log('\nself-check passed');
