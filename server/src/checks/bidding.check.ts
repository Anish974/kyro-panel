// Run: npm run check -w server
//
// The deck's page-8 scenario must reproduce. If it stops reproducing, the
// bidding logic is wrong — not the test.

import assert from 'node:assert';
import { CUSTOMER_GAP, context, draftFallback, runPanel } from '../panel/bidding.js';
import * as model from '../panel/model.js';

model.reset();

// 1. Technical answer with no customer angle -> product takes the floor at 0.95
const first = await runPanel('We put a payment queue in front of Redis so writes never block.');
const byId = Object.fromEntries(first.bids.map(b => [b.panelist, b.score]));

assert.equal(first.winner, 'product', `product should win, got ${first.winner}`);
assert.equal(byId.product, 0.95, `product bid should be 0.95, got ${byId.product}`);
assert.ok(byId.product > byId.technical, 'product must outbid technical here');
assert.ok(
  // Imported, not retyped: this assertion broke the day the gap was reworded,
  // which is a test failing for the wrong reason.
  model.getModel().gaps.includes(CUSTOMER_GAP),
  'the unquantified-impact gap must be recorded on the shared model',
);

// 2. The floor moves — product does not speak twice in a row
const second = await runPanel('We sharded by merchant id because hot merchants caused write locks.');
assert.notEqual(second.winner, 'product', 'floor should move after product just spoke');

// 3. An answer that does mention the customer must not trigger the 0.95 spike
model.reset();
const third = await runPanel('We queued the writes so checkout confirmation still returns in 200ms for the buyer.');
const thirdProduct = third.bids.find(b => b.panelist === 'product')!.score;
assert.ok(thirdProduct < 0.95, `no spike when customer impact is covered, got ${thirdProduct}`);

// 4. Every panelist gets a bid, every turn
assert.equal(first.bids.length, 3, 'all three panelists must bid');

// 5. The prompt asks for three bids and ONE question.
//
// This is the shape the panel's latency rests on. Three drafted questions used
// to come back and two were thrown away — never spoken, never shown — which
// measured 90 of 246 output tokens against the live model, and output tokens
// are what the candidate waits through at about 3.5ms each. A revert here is
// silent: the panel would still work, just slower every single turn, so the
// shape is pinned rather than trusted.
const prompt = context('We sharded the writes by tenant id.', ['product', 'hr']);

assert.ok(
  prompt.includes('Only these panelists may take the floor this turn: product, hr.'),
  'the eligible set has to reach the prompt, or the model writes for a panelist who cannot speak',
);
assert.ok(
  prompt.includes('"floor": "product" | "hr"'),
  'and the floor it may choose is limited to that set',
);
assert.ok(
  prompt.includes('you write only that one question'),
  'one question, not three — two of three were always discarded',
);
assert.ok(
  prompt.includes('{"bids": {"technical": {...}, "product": {...}, "hr": {...}}'),
  'all three still bid, because the room draws a tile per panelist from them',
);

// 6. The prompt carries every question already asked, not just the last three.
//
// It used to carry six transcript lines and nothing else, so a question that
// scrolled out of that window had, as far as the model could see, never been
// asked. One interview got "which process is listening on port 80" three times
// in three minutes that way.
model.reset();
model.addTurn({ speaker: 'technical', text: 'Which process is listening on port 80?' });
for (let i = 0; i < 4; i++) {
  model.addTurn({ speaker: 'candidate', text: `filler answer number ${i}` });
  model.addTurn({ speaker: 'product', text: `filler question number ${i}?` });
}

const long = context('and that is how we shipped it.');
const recentBlock = long.slice(long.indexOf('Recent exchange:'), long.indexOf('ALREADY ASKED'));
assert.ok(
  !recentBlock.includes('port 80'),
  'sanity: the port 80 question has scrolled out of the six-line window',
);
assert.ok(
  long.includes('ALREADY ASKED'),
  'the prompt must list what has already been asked',
);
assert.ok(
  long.includes('- Which process is listening on port 80?'),
  'including a question the recent-exchange window no longer shows',
);

// 7. A fallback line is never repeated inside one interview.
//
// The picker used to index on the turn number, so a long interview wrapped
// round and asked its opening question again, word for word.
model.reset();
const spoken = new Set<string>();
for (let i = 0; i < 5; i++) {
  const line = draftFallback('technical');
  assert.ok(!spoken.has(line), `fallback repeated inside one interview: "${line}"`);
  spoken.add(line);
  model.addTurn({ speaker: 'candidate', text: `answer ${i} with enough words to count` });
  model.addTurn({ speaker: 'technical', text: line });
}

console.log('bids  ', byId);
console.log('turn 1', first.winner, '|', first.bids[0].reason);
console.log('turn 2', second.winner);
console.log('skills', model.getModel().skills);
console.log('\nself-check passed');
