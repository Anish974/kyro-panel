// Run: npm run check -w server
//
// Regression guard for the scorecard that read three NO HIRE verdicts citing
// "looping" against a candidate who said each thing once. The four turns below
// are the real ones, taken off that scorecard's claims ledger — Agora's ASR
// resending one twenty-second answer, longer each time.

import assert from 'node:assert';
import { continues } from '../panel/continuation.js';
import { ingest } from '../panel/ledger.js';
import * as model from '../panel/model.js';

const UTMS = [
  'So we are building the UTMS that is unmanned traffic management system What it does, it does like, it controls multiple rooms at a same time like, a real time telemetry, real time control over the multiple rooms over the over the world, like,',
  "So we are building the UTMS that is unmanned traffic management system What it does, it does like, it controls multiple rooms at a same time like, a real time telemetry, real time control over the multiple rooms over the over the world, like, I'm controlling a drone from India and",
  "So we are building the UTMS that is unmanned traffic management system What it does, it does like, it controls multiple rooms at a same time like, a real time telemetry, real time control over the multiple rooms over the over the world, like, I'm controlling a drone from India and it is controlled",
  "So we are building the UTMS that is unmanned traffic management system What it does, it does like, it controls multiple rooms at a same time like, a real time telemetry, real time control over the multiple rooms over the over the world, like, I'm controlling a drone from India and it is controlled in the US as well.",
];

// --- what counts as a continuation -----------------------------------------

assert.equal(continues(UTMS[0], UTMS[1]), true, 'a longer retelling of the same words continues it');
assert.equal(continues(UTMS[1], UTMS[0]), false, 'a shorter one does not continue a longer one');
assert.equal(continues(UTMS[0], UTMS[0]), false, 'identical text adds nothing to supersede');

// A candidate really saying the same thing twice says the SAME words. Only
// growth counts, so genuine repetition still reaches the panel as repetition.
assert.equal(
  continues('We used Redis for the queue.', 'We used Redis for the queue.'),
  false,
  'verbatim repetition is not a continuation',
);
assert.equal(
  continues('We used Redis.', 'We used Redis and Postgres for the ledger.'),
  false,
  'a short shared opening is coincidence, not continuation',
);
assert.equal(
  continues('Yes', 'Yes, we sharded the database by tenant id.'),
  false,
  'a one-word answer never swallows the answer after it',
);

// --- the transcript the panel reads ----------------------------------------

model.reset();
for (const turn of UTMS) {
  model.addTurn({ speaker: 'candidate', text: turn });
  model.addTurn({ speaker: 'technical', text: 'Where does that break first?' });
}

const said = model.getModel().transcript.filter(t => t.speaker === 'candidate');
assert.equal(said.length, 1, `one answer, one transcript line — got ${said.length}`);
assert.equal(said[0].text, UTMS[3], 'the line kept is the complete one, not the first fragment');
assert.equal(model.getModel().turns, 1, `one answer must cost one of the ten turns, spent ${model.getModel().turns}`);

// Two genuinely different answers still count separately.
model.addTurn({ speaker: 'candidate', text: 'We handle deconfliction with a geofencing service.' });
assert.equal(model.getModel().turns, 2, 'a real second answer still counts');

// --- the ledger the scorecard quotes ---------------------------------------

model.reset();
for (const turn of UTMS) ingest(turn);

const utms = model.getModel().claims.filter(c => /unmanned traffic/i.test(c.text));
assert.equal(utms.length, 1, `one statement, one claim — got ${utms.length}`);
assert.equal(utms[0].text, UTMS[3], 'the claim holds the full sentence');

// The other pair off the same scorecard: an answer cut mid-word, then finished.
model.reset();
ingest("Have just graduated from the RCU I'm just part of the");
ingest("Have just graduated from the RCU I'm just part of the startup.");
assert.equal(model.getModel().claims.length, 1, 'a finished sentence replaces its own fragment');

console.log('continuation  one spoken answer is one turn and one claim, however often ASR resends it');
console.log('              verbatim repetition still reads as repetition');
console.log('\nself-check passed');
