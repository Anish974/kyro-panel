// Run: npm run check:ledger -w server
//
// The kill test from docs/workflow.md Phase 6: say "zero downtime" early and
// "backed up for an hour" later, and the ledger must catch it with both
// timestamps.

import assert from 'node:assert';
import { ingest, flaggedCount } from '../panel/ledger.js';
import * as model from '../panel/model.js';

model.reset();

// 1. Contradiction across two answers
ingest('We migrated the whole payment path and we had zero downtime during the rollout.');
ingest('The queue backed up for about an hour on the first day, so we throttled writes.');

const claims = model.getModel().claims;
const contradicted = claims.filter(c => c.status === 'contradicted');

assert.ok(contradicted.length >= 2, `both sides should be flagged, got ${contradicted.length}`);
assert.ok(
  contradicted.some(c => /zero downtime/i.test(c.text)),
  'the original "zero downtime" claim must be flagged',
);
assert.ok(
  contradicted.some(c => /backed up/i.test(c.text)),
  'the later "backed up" claim must be flagged',
);
const later = contradicted.find(c => c.conflictsWith);
assert.ok(later?.conflictsWith, 'the later claim must name the claim it conflicts with');
assert.ok(
  claims.every(c => typeof c.t === 'number'),
  'every claim carries a timestamp — the scorecard cites them',
);

// 2. Vague: a magnitude word with no number
model.reset();
ingest('We cut latency massively after the rewrite.');
const vague = model.getModel().claims.filter(c => c.status === 'vague');
assert.equal(vague.length, 1, `expected one vague claim, got ${vague.length}`);

// 3. Not vague once a real number is given
model.reset();
ingest('We cut p99 latency from 800ms to 120ms after the rewrite.');
assert.equal(
  model.getModel().claims.filter(c => c.status === 'vague').length,
  0,
  'a quantified claim is not vague',
);

// 4. Two unrelated topics must not be treated as a contradiction
model.reset();
ingest('We had zero downtime during the migration.');
ingest('We handled about 4000 requests per second at peak.');
assert.equal(
  model.getModel().claims.filter(c => c.status === 'contradicted').length,
  0,
  'availability and scale are different concepts — no false contradiction',
);

// 5. Questions and opinions are not claims
model.reset();
ingest('That is a fair point.');
assert.equal(model.getModel().claims.length, 0, 'opinions are not tracked as claims');

// Rebuild the demo state so the printout shows the real scenario
model.reset();
ingest('We migrated the whole payment path and we had zero downtime during the rollout.');
ingest('The queue backed up for about an hour on the first day, so we throttled writes.');
ingest('We cut latency massively after that.');

for (const c of model.getModel().claims) {
  // A flag the candidate answers must clear. A ledger that only ever accuses is
// not a ledger.
model.reset();
ingest('We cut latency massively after that.');
const flagged = model.getModel().claims.find(c => c.status === 'vague');
assert.ok(flagged, 'an unquantified magnitude claim must be flagged first');
ingest('To be precise, p99 latency went from 180ms down to 40ms.');
assert.equal(
  model.getModel().claims.find(c => c.id === flagged!.id)!.status,
  'verified',
  'a vague claim answered with real numbers must clear to verified',
);

console.log(`  [${c.status.padEnd(13)}] ${c.t}s  ${c.text}`);
  if (c.note) console.log(`  ${' '.repeat(16)}${c.note}`);
}
console.log(`\n${model.getModel().claims.length} tracked · ${flaggedCount()} flagged`);
console.log('self-check passed');
