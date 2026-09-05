// Run: npm run check -w server
//
// The deck's page-8 scenario must reproduce. If it stops reproducing, the
// bidding logic is wrong — not the test.

import assert from 'node:assert';
import { CUSTOMER_GAP, runPanel } from '../panel/bidding.js';
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

console.log('bids  ', byId);
console.log('turn 1', first.winner, '|', first.bids[0].reason);
console.log('turn 2', second.winner);
console.log('skills', model.getModel().skills);
console.log('\nself-check passed');
