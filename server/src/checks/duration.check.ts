// Run: npm run check -w server
//
// A booked length is one number, and everything that paces the interview has to
// come off it. When they drifted apart the failures were quiet ones: a
// five-minute screen whose panel was still asking its eighth question, a
// fifteen-minute interview killed mid-answer by a reaper set for fifteen, and a
// completed screen whose verdicts read as low-confidence because the ceiling
// was still counting to ten.

import assert from 'node:assert';
import { DEFAULT_DURATION, DURATIONS, asDuration } from '@kyro/shared';
import * as model from '../panel/model.js';
import { confidenceCeiling } from '../panel/verdicts.js';

const book = (durationMin: number) => {
  model.setProfile({
    name: 'Ada Lovelace',
    role: 'Backend Engineer',
    level: 'Intermediate (2-6 years)',
    durationMin,
  });
};

// --- the budget follows the booking ----------------------------------------

for (const minutes of DURATIONS) {
  book(minutes);
  assert.equal(model.durationMin(), minutes, `a ${minutes}-minute interview must keep its length`);
  assert.equal(
    model.concludeAtTurn(),
    minutes,
    `a ${minutes}-minute interview closes on turn ${minutes} — one question a minute`,
  );
}

// Anything that is not one of ours is not a length. A tampered post picks the
// default rather than pacing the panel off an arbitrary number.
for (const junk of [0, -5, 7, 999, 'ten', null, undefined, {}]) {
  assert.equal(asDuration(junk), null, `${JSON.stringify(junk)} is not a scheduled duration`);
}
book(999);
assert.equal(model.durationMin(), DEFAULT_DURATION, 'an unrecognised length falls back to the default');

// --- the wall clock is the backstop ----------------------------------------

// Turns establish the baseline budget, but if time remains, the panel keeps
// probing in depth. The interview concludes when the booked duration elapses.
book(5);
assert.ok(!model.shouldConclude(), 'a fresh interview is not over');
for (let i = 0; i < 5; i++) model.addTurn({ speaker: 'candidate', text: `answer ${i}` });
assert.ok(!model.shouldConclude(), 'five turns with time remaining continues for in-depth probing');
model.setSimulatedElapsed(300);
assert.ok(model.shouldConclude(), 'concludes once booked duration has elapsed');
model.setSimulatedElapsed(null);

// --- the closing is announced exactly once ---------------------------------

assert.ok(model.announceConclusion(), 'the first call announces the close');
assert.ok(!model.announceConclusion(), 'the second must not — the room restarts its leave timer on each');
model.reset();
assert.ok(model.announceConclusion(), 'and a reset session may announce its own close');

// --- confidence is a share of what was booked ------------------------------

// The same five answers mean different things at different lengths: a finished
// five-minute screen, and a half-abandoned fifteen-minute interview. Scored on
// absolute turns they came out identical, which called the completed one
// unreliable and the abandoned one solid.
book(5);
for (let i = 0; i < 5; i++) model.addTurn({ speaker: 'candidate', text: `answer ${i}` });
const screen = confidenceCeiling();

book(15);
for (let i = 0; i < 5; i++) model.addTurn({ speaker: 'candidate', text: `answer ${i}` });
const abandoned = confidenceCeiling();

assert.ok(
  screen > abandoned,
  `a finished 5-minute screen (${screen}) must outrank a 5-of-15 fragment (${abandoned})`,
);
assert.equal(screen, 0.95, 'a screen answered end to end is a complete interview of its kind');

// The ten-turn thresholds are what every interview before this feature ran on,
// so they have to come out unchanged.
book(10);
const at = (turns: number): number => {
  book(10);
  for (let i = 0; i < turns; i++) model.addTurn({ speaker: 'candidate', text: `answer ${i}` });
  return confidenceCeiling();
};
assert.equal(at(8), 0.95, 'ten-minute interview, eight answers — unchanged');
assert.equal(at(5), 0.75, 'ten-minute interview, five answers — unchanged');
assert.equal(at(3), 0.6, 'ten-minute interview, three answers — unchanged');
assert.equal(at(2), 0.4, 'ten-minute interview, two answers — unchanged');

// --- the schedule survives a reset -----------------------------------------

book(15);
model.reset();
assert.equal(model.durationMin(), 15, 'a reset does not un-book the interview');

console.log('duration  one booked length, and every ceiling derives from it');
console.log('          turns close it, and the wall clock closes it when turns do not');
console.log('          confidence is a share of what was booked, not a count of turns');
console.log('          the ten-minute thresholds are untouched');
console.log('\nself-check passed');
