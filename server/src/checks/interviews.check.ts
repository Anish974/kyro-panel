// Run: npm run check -w server
//
// The login screen used to let the candidate choose their own experience level,
// and level drives difficulty — so the person being graded set the bar. These
// assertions are the fix: the level comes off an interview the company created,
// and nothing the candidate sends can move it.

import assert from 'node:assert';
import { EXPERIENCE_LEVELS } from '@kyro/shared';
import { InterviewError, create, find, list, markStarted, reset } from '../panel/interviews.js';

reset();

const made = create({
  candidateName: 'Anish Patankar',
  role: 'Full-Stack Engineer',
  level: 'Intern',
});

assert.match(made.code, /^[0-9A-HJKMNP-TV-Z]{6}$/, `code must be 6 unambiguous chars, got ${made.code}`);
assert.equal(made.startedAt, null, 'a scheduled interview has not started');
assert.equal(find(made.code)?.role, 'Full-Stack Engineer', 'the code resolves to the invite');
assert.equal(find(made.code.toLowerCase())?.code, made.code, 'a code typed in lower case still resolves');
assert.equal(find('ZZZZZZ'), null, 'an unknown code resolves to nothing');

// --- the bar is the company's to set ---------------------------------------

for (const level of EXPERIENCE_LEVELS) {
  assert.ok(create({ candidateName: 'A', role: 'R', level }).code, `${level} must be accepted`);
}
assert.throws(
  () => create({ candidateName: 'A', role: 'R', level: 'Trivial (no experience)' }),
  InterviewError,
  'an unpublished level must be refused, not silently graded as the default',
);
assert.throws(() => create({ candidateName: '', role: 'R', level: 'Intern' }), InterviewError);
assert.throws(() => create({ candidateName: 'A', role: '  ', level: 'Intern' }), InterviewError);

// --- untrusted input -------------------------------------------------------

const long = create({ candidateName: 'x'.repeat(500), role: 'y'.repeat(500), level: 'Intern' });
assert.equal(long.candidateName.length, 80, 'the name is capped');
assert.equal(long.role.length, 80, 'the role is capped');

const controls = create({ candidateName: 'An\nish\u0000', role: 'Eng\tineer', level: 'Intern' });
assert.ok(!/[\u0000-\u001f]/.test(controls.candidateName + controls.role), 'control characters are stripped');

// --- the portal's view ------------------------------------------------------

assert.equal(list()[0].code, controls.code, 'the newest interview is listed first');
assert.equal(new Set(list().map(i => i.code)).size, list().length, 'codes never collide');

const started = markStarted(made.code);
assert.ok(started?.startedAt, 'joining records when');
const again = markStarted(made.code);
assert.equal(again?.startedAt, started?.startedAt, 'a refresh must not restart the clock');
assert.equal(markStarted('ZZZZZZ'), null, 'an unknown code cannot be started');

// --- practice versus assessment --------------------------------------------

// A mock is the one place a candidate may pick their own level, because nobody
// hires off it. Everything hangs off this flag, so it must not be settable by
// anything that merely looks truthy arriving over the wire.
assert.equal(made.mock, false, 'an interview is an assessment unless it says otherwise');
assert.equal(create({ candidateName: 'A', role: 'R', level: 'Intern', mock: true }).mock, true);
for (const truthy of ['yes', 'true', 1, {}, []]) {
  assert.equal(
    create({ candidateName: 'A', role: 'R', level: 'Intern', mock: truthy }).mock,
    false,
    `mock: ${JSON.stringify(truthy)} must not pass for practice`,
  );
}

console.log('interviews  the company sets role and level, the candidate only turns up');
console.log('            unpublished levels, blank fields and control characters are refused');
console.log('            a mock is practice, and only a real boolean makes one');
console.log('\nself-check passed');
