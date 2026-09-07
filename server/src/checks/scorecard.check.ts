// Run: npm run check -w server
//
// The scorecard's whole claim is that it is evidence-bound and that dissent
// survives. Both must hold on a real interview, not on a fixture.

import assert from 'node:assert';
import { runPanel } from '../panel/bidding.js';
import { buildScorecard } from '../panel/scorecard.js';
import { confidenceCeiling } from '../panel/verdicts.js';
import * as model from '../panel/model.js';

model.reset();

// A candidate who is strong on infrastructure and never mentions the customer:
// technical should like them, product should not. That is the dissent case.
await runPanel('We put a payment queue in front of Redis so writes never block.');
await runPanel('We sharded by merchant id because hot merchants caused write locks.');
await runPanel('Replica lag was the real constraint, so we indexed on the partition key.');

const card = await buildScorecard('Anish Patankar');
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
// ------------------------------------------------------- the record itself
// The verdicts quote two lines each and the ledger keeps the checkable
// sentences. Neither is the conversation, and a hiring decision nobody can read
// back is not a reviewable one — so the whole transcript rides on the card.
assert.ok(card.transcript, 'the scorecard must carry the transcript');
assert.equal(
  card.transcript!.length,
  model.getModel().transcript.length,
  'all of it, not a sample',
);
assert.deepEqual(
  card.transcript!.map(t => t.text),
  model.getModel().transcript.map(t => t.text),
  'in order, word for word',
);
assert.ok(
  card.transcript!.every(t => typeof t.t === 'number'),
  'every line carries the second it was said at, so a quote can be found again',
);
assert.ok(
  card.transcript!.some(t => t.speaker === 'candidate'),
  'including what the candidate said, which is the half being judged',
);

// A verdict is only ever as sure as the interview behind it, and the two paths
// that write one must agree about that. This card came off three turns with no
// LLM key, so the arithmetic path wrote it — and it used to claim up to 0.95
// while the write-up path was held to 0.6 on the very same transcript. A failed
// write-up reading as MORE certain than a successful one is the wrong way round
// on a hiring document.
const ceiling = confidenceCeiling();
for (const v of card.verdicts) {
  assert.ok(
    v.confidence <= ceiling,
    `${v.panelist} is over the ${ceiling} ceiling for ${model.getModel().turns} turns: ${v.confidence}`,
  );
  if (v.evidence.length === 0) {
    assert.ok(v.confidence <= 0.4, `${v.panelist} cited nothing but claims ${v.confidence}`);
  }
}

model.reset();
const empty = await buildScorecard('Nobody');
for (const v of empty.verdicts) {
  assert.equal(v.evidence.length, 0, `${v.panelist} cited evidence from an empty interview`);
  assert.ok(v.confidence <= 0.4, `${v.panelist} is too confident with no evidence: ${v.confidence}`);
}

// --- a room that lost count must not write the interview down as 00:00 ------
//
// The room sends its own clock with the request, and the server takes it over
// its own. That is right when the room knows: it started the timer when the
// candidate joined, and the session clock started earlier, at the profile POST.
//
// It sent 0 when it did NOT know. The backstop that ends an interview the panel
// never closed captures its handler from the render that opened the session,
// where the counter is still zero, so a real six-minute interview arrived here
// as duration=0 and was written up as 00:00 next to four turns of transcript.
// The room no longer counts that way, and a zero is no longer taken as an
// answer here either — two independent fixes, because either one alone leaves
// a recruiter reading a card that says the assessment took no time at all.
model.reset();
model.setSimulatedElapsed(372);
const lostCount = await buildScorecard('Anish Patankar', 'Data Engineer', 'Intern', 0);
assert.equal(
  lostCount.durationSec,
  372,
  'a duration of 0 is a room that lost count, not an interview that took no time',
);

const known = await buildScorecard('Anish Patankar', 'Data Engineer', 'Intern', 300);
assert.equal(known.durationSec, 300, 'a real number from the room still wins over the session clock');
model.setSimulatedElapsed(null);

for (const v of card.verdicts) {
  console.log(v.panelist.padEnd(10), v.verdict.padEnd(13), v.score, '| evidence', v.evidence.length);
}
console.log('dissent', card.dissent);
console.log('         the full transcript is on the card, in order, with timings');
console.log('         and a room that lost count does not write the card down as 00:00');
console.log('\nself-check passed');