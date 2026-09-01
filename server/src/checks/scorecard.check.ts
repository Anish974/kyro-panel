// Run: npm run check -w server
//
// The scorecard's whole claim is that it is evidence-bound and that dissent
// survives. Both must hold on a real interview, not on a fixture.

import assert from 'node:assert';
import { runPanel } from '../panel/bidding.js';
import { buildScorecard } from '../panel/scorecard.js';
import * as model from '../panel/model.js';

model.reset();

// A candidate who is strong on infrastructure and never mentions the customer:
// technical should like them, product should not. That is the dissent case.
await runPanel('We put a payment queue in front of Redis so writes never block.');
await runPanel('We sharded by merchant id because hot merchants caused write locks.');
await runPanel('Replica lag was the real constraint, so we indexed on the partition key.');

const card = buildScorecard('Anish Patankar');
const by = Object.fromEntries(card.verdicts.map(v => [v.panelist, v]));

assert.equal(card.verdicts.length, 3, 'all three panelists must return a verdict');
assert.ok(by.technical.score > by.product.score, 'technical must outscore product on this transcript');
assert.ok(card.dissent, 'panel disagreed here — dissent must be flagged, not averaged away');

// Evidence is the point: every quote must be something the candidate said.
const said = new Set(
  model.getModel().transcript.filter(t => t.speaker === 'candidate').map(t => t.text),
);
for (const v of card.verdicts) {
  for (const e of v.evidence) {
    assert.ok(said.has(e.quote), `fabricated quote in ${v.panelist}: ${e.quote}`);
  }
}
assert.ok(by.technical.evidence.length > 0, 'technical heard system-design signal and must cite it');

// No quotes, no confidence.
model.reset();
const empty = buildScorecard('Nobody');
for (const v of empty.verdicts) {
  assert.equal(v.evidence.length, 0, `${v.panelist} cited evidence from an empty interview`);
  assert.ok(v.confidence <= 0.4, `${v.panelist} is too confident with no evidence: ${v.confidence}`);
}

for (const v of card.verdicts) {
  console.log(v.panelist.padEnd(10), v.verdict.padEnd(13), v.score, '| evidence', v.evidence.length);
}
console.log('dissent', card.dissent);
console.log('\nself-check passed');
