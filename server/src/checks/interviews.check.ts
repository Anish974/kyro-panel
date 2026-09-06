// Run: npm run check -w server
//
// The login screen used to let the candidate choose their own experience level,
// and level drives difficulty — so the person being graded set the bar. These
// assertions are the fix: the level comes off an interview the company created,
// and nothing the candidate sends can move it.
//
// Deleted before the module loads, so this exercises the in-memory path and can
// never write rows into a real database — a check that needs the network is a
// check nobody runs.
delete process.env.DATABASE_URL;

import assert from 'node:assert';
import { EXPERIENCE_LEVELS } from '@kyro/shared';
import { InterviewError, create, find, list, markStarted, reset } from '../panel/interviews.js';

reset();

const ACME = 'acme-recruiter-uuid';
const RIVAL = 'rival-recruiter-uuid';

const made = await create({
  candidateName: 'Anish Patankar',
  role: 'Full-Stack Engineer',
  level: 'Intern',
  ownerId: ACME,
});

assert.match(made.code, /^[0-9A-HJKMNP-TV-Z]{6}$/, `code must be 6 unambiguous chars, got ${made.code}`);
assert.equal(made.startedAt, null, 'a scheduled interview has not started');
assert.equal((await find(made.code))?.role, 'Full-Stack Engineer', 'the code resolves to the invite');
assert.equal((await find(made.code.toLowerCase()))?.code, made.code, 'a lower-case code still resolves');
assert.equal(await find('ZZZZZZ'), null, 'an unknown code resolves to nothing');

// --- the bar is the company's to set ---------------------------------------

for (const level of EXPERIENCE_LEVELS) {
  assert.ok((await create({ candidateName: 'A', role: 'R', level })).code, `${level} must be accepted`);
}

const refused = async (input: Parameters<typeof create>[0]) => {
  await assert.rejects(() => create(input), InterviewError);
};

await refused({ candidateName: 'A', role: 'R', level: 'Trivial (no experience)' });
await refused({ candidateName: '', role: 'R', level: 'Intern' });
await refused({ candidateName: 'A', role: '  ', level: 'Intern' });

// --- untrusted input -------------------------------------------------------

const long = await create({ candidateName: 'x'.repeat(500), role: 'y'.repeat(500), level: 'Intern' });
assert.equal(long.candidateName.length, 80, 'the name is capped');
assert.equal(long.role.length, 80, 'the role is capped');

const controls = await create({ candidateName: 'An\nish\u0000', role: 'Eng\tineer', level: 'Intern', ownerId: ACME });
assert.ok(!/[\u0000-\u001f]/.test(controls.candidateName + controls.role), 'control characters are stripped');

// --- the portal's view ------------------------------------------------------

const scheduled = await list(ACME);
assert.equal(scheduled[0].code, controls.code, 'the newest interview is listed first');
assert.ok(scheduled.every(i => i.ownerId === ACME), 'and the list holds nothing that is not theirs');
assert.equal(new Set(scheduled.map(i => i.code)).size, scheduled.length, 'codes never collide');

const started = await markStarted(made.code);
assert.ok(started?.startedAt, 'joining records when');
const again = await markStarted(made.code);
assert.equal(again?.startedAt, started?.startedAt, 'a refresh must not restart the clock');
assert.equal(await markStarted('ZZZZZZ'), null, 'an unknown code cannot be started');

// --- one company cannot see another's candidates ---------------------------

// The bug this closes: every scorecard and every candidate name was one URL
// away from anyone who found it, across every company on the deployment.
await create({ candidateName: 'Rival Candidate', role: 'Backend Engineer', level: 'Intern', ownerId: RIVAL });

const acme = await list(ACME);
const rival = await list(RIVAL);
assert.ok(acme.length > 0 && rival.length > 0, 'both recruiters have interviews');
assert.ok(acme.every(i => i.ownerId === ACME), "acme's list is only acme's");
assert.ok(
  !acme.some(i => i.candidateName === 'Rival Candidate'),
  "one company must never see another company's candidate",
);
assert.equal(rival.length, 1, 'and the rival sees exactly their own');
assert.deepEqual(await list('nobody-at-all'), [], 'an unknown recruiter sees nothing');

// --- practice versus assessment --------------------------------------------

// A mock is the one place a candidate may pick their own level, because nobody
// hires off it. Everything hangs off this flag, so it must not be settable by
// anything that merely looks truthy arriving over the wire.
assert.equal(made.mock, false, 'an interview is an assessment unless it says otherwise');
const practice = await create({ candidateName: 'A', role: 'R', level: 'Intern', mock: true, ownerId: ACME });
assert.equal(practice.mock, true);
// A mock is the candidate's own. Even handed an owner it takes none, which is
// what keeps practice out of every company portal.
assert.equal(practice.ownerId, null, 'a mock belongs to nobody, whoever created it');
assert.ok(!(await list(ACME)).some(i => i.code === practice.code), 'and never lands in a portal');
for (const truthy of ['yes', 'true', 1, {}, []]) {
  assert.equal(
    (await create({ candidateName: 'A', role: 'R', level: 'Intern', mock: truthy })).mock,
    false,
    `mock: ${JSON.stringify(truthy)} must not pass for practice`,
  );
}

console.log('interviews  the company sets role and level, the candidate only turns up');
console.log('            unpublished levels, blank fields and control characters are refused');
console.log('            a mock is practice, owned by nobody, and only a real boolean makes one');
console.log('            one recruiter never sees another recruiter’s candidates');
console.log('\nself-check passed');
