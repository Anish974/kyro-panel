// Run: npm run check -w server
//
// Role-play and adaptive difficulty are track requirements, so their rules
// have to hold without a network: one scenario at a time, it closes on a
// count, and difficulty cannot run away.

import assert from 'node:assert';
import * as model from './model.js';

model.reset();

// 1. One at a time. A second panelist cannot open one over a running scenario.
const first = model.openScenario('Checkout is failing at 2am and you are on call.', 'technical');
assert.ok(first, 'the first scenario must open');
assert.equal(model.openScenario('Something else entirely.', 'product'), null,
  'a second scenario must be refused while one is running');
assert.equal(model.scenario()!.premise, first!.premise, 'the running scenario must not be replaced');
assert.equal(model.scenario()!.openedBy, 'technical', 'the opener must be recorded');

// 2. It closes on a count, not on mood.
model.advanceScenario();
model.advanceScenario();
assert.equal(model.scenario()!.turns, 2, 'answers inside the scenario must be counted');
model.closeScenario();
assert.equal(model.scenario(), null, 'a closed scenario must leave nothing behind');

// 3. Once closed, the floor is free again.
assert.ok(model.openScenario('A different situation.', 'hr'), 'a new scenario may open after close');
model.closeScenario();

// 4. Difficulty moves, and stays inside 1..5 no matter how hard it is pushed.
model.reset();
assert.equal(model.getModel().difficulty, 2, 'difficulty starts at 2');
model.adjustDifficulty(1);
assert.equal(model.getModel().difficulty, 3, 'a strong answer must raise the level');
for (let i = 0; i < 10; i++) model.adjustDifficulty(1);
assert.equal(model.getModel().difficulty, 5, 'difficulty must clamp at 5');
for (let i = 0; i < 20; i++) model.adjustDifficulty(-1);
assert.equal(model.getModel().difficulty, 1, 'difficulty must clamp at 1');

// 5. reset() must restart the clock. Left running, every timestamp after a
//    reset is measured from server start and a fresh demo opens at 14 minutes.
//    Real time has to pass or this test passes with the bug still in place.
await new Promise(r => setTimeout(r, 1100));
const before = model.getModel().elapsed;
assert.ok(before >= 1, `the clock must be running before we reset it, got ${before}s`);
model.reset();
const after = model.getModel().elapsed;
assert.ok(after < before, `reset must restart the clock: ${before}s -> ${after}s`);

console.log('scenario  opens once, counts answers, closes on count');
console.log('reset     restarts the session clock');
console.log('difficulty moves and clamps to 1..5');
console.log('\nself-check passed');
