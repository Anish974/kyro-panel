// Run: npm run check -w server
//
// The invite code is the candidate's only credential, and until it was checked
// three things were taken on trust from a browser that belongs to the person
// being graded:
//
//   the bar      role, level and the booked length arrived in the POST, so the
//                candidate set how hard their own interview was and how long it
//                ran — level drives difficulty and every prompt, duration
//                drives the turn budget and every confidence ceiling
//   the money    /agent/start put a billable Agora agent in a channel for
//                anyone who knew the hostname
//   the record   /scorecard took `mock` off the query string, and the portal
//                hides mocks — so a candidate could append &mock=1 on the way
//                out and their assessment never reached the recruiter
//
// All three now come off the interview row the server resolved for itself.

import assert from 'node:assert';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { create, reset as resetInterviews } from '../panel/interviews.js';
import * as model from '../panel/model.js';

resetInterviews();
model.reset(true);

const ACME = '11111111-1111-1111-1111-111111111111';

const booked = await create({
  candidateName: 'Ada Lovelace',
  role: 'Platform / Infrastructure Engineer',
  level: 'Expert (6-11+ years)',
  durationMin: 15,
  ownerId: ACME,
});

// --- the bar comes off the interview, not off the post ----------------------

// Everything the candidate could gain by lying: an easier bar, a role they
// would rather be asked about, and a shorter interview.
const saved = model.setProfile(
  {
    name: 'Ada Lovelace',
    role: 'Frontend Engineer',
    level: 'Intern',
    durationMin: 5,
    resumeText: 'Built a thing.',
  },
  booked,
);

assert.ok(saved, 'a candidate with an interview behind them still signs in');
assert.equal(saved.role, booked.role, 'the role is what the company scheduled');
assert.equal(saved.level, booked.level, 'and so is the bar');
assert.equal(model.durationMin(), 15, 'and so is the booked length');
assert.equal(model.concludeAtTurn(), 15, 'so the turn budget follows the booking, not the post');
// The candidate still owns the parts that are genuinely theirs.
assert.equal(saved.name, 'Ada Lovelace', 'their own name is still their own');
assert.equal(saved.resumeText, 'Built a thing.', 'and so is their resume');

// Difficulty is derived from the level, so it has to follow the real one.
assert.equal(model.getModel().difficulty, 4, 'an Expert bar starts where an Expert bar starts');

// --- the code is the credential ---------------------------------------------

assert.ok(model.ownsSession(booked.code), 'the room that opened this interview owns it');
assert.ok(model.ownsSession(booked.code.toLowerCase()), 'case is not the secret');
assert.ok(model.ownsSession(` ${booked.code} `), 'nor is whitespace around it');

for (const wrong of ['', '000000', 'ABCDEF', null, undefined, 42, {}, booked.code + 'X']) {
  assert.ok(!model.ownsSession(wrong), `${JSON.stringify(wrong)} must not pass for the code`);
}

// A different real interview's code is still the wrong code.
const other = await create({
  candidateName: 'Someone Else', role: 'Backend Engineer',
  level: 'Intern', durationMin: 5, ownerId: ACME,
});
assert.ok(!model.ownsSession(other.code), 'another interview’s code does not open this one');

// --- practice is the company's call, not the candidate's --------------------

// The portal shows assessments and hides mocks, so this flag decides whether a
// recruiter ever sees the result. It belongs to the row, which is written when
// the interview is scheduled.
assert.equal(model.interview()?.mock, false, 'an interview scheduled by a company is an assessment');

const practice = await create({
  candidateName: 'Ada Lovelace', role: 'Backend Engineer',
  level: 'Intern', durationMin: 5, mock: true,
});
model.setProfile({ name: 'Ada Lovelace' }, practice);
assert.equal(model.interview()?.mock, true, 'and practice the candidate set up for themselves is a mock');

// --- a session with no interview behind it is not owned by anyone ------------

// Nothing can present a code that matches, so the routes fall back to their
// old un-gated behaviour rather than silently accepting whatever turns up.
model.reset(true);
model.setProfile({ name: 'Nobody', role: 'Backend Engineer' }, null);
assert.equal(model.interview(), null, 'no code, no interview');
assert.ok(!model.ownsSession('anything'), 'and nothing owns a session with no interview');

// --- and the routes actually enforce it -------------------------------------
//
// Everything above is the model's own view. These drive the real endpoints,
// because a rule the routes forget to ask about is not a rule.

const app = express();
app.use(express.json());
app.use((await import('../routes/events.js')).default);
app.use((await import('../routes/agent.js')).default);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const post = async (path: string, body: unknown): Promise<number> =>
  (await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })).status;

resetInterviews();
const real = await create({
  candidateName: 'Ada Lovelace', role: 'Backend Engineer',
  level: 'Intern', durationMin: 5, ownerId: ACME,
});

assert.equal(await post('/candidate', { name: 'Ada', code: 'ZZZZZZ' }), 404, 'a code that resolves to nothing is refused');
assert.equal(await post('/candidate', { name: 'Ada' }), 400, 'and no code at all is refused outright');

// The attack that made the code mandatory: /candidate resets the session, so
// while it was open anyone holding the hostname could erase an interview that
// was still being conducted. Verified against a session with real turns in it.
await post('/candidate', {
  name: 'Ada Lovelace', level: 'Intermediate (2-6 years)', code: real.code,
});
for (let i = 0; i < 4; i++) model.addTurn({ speaker: 'candidate', text: `real answer ${i}` });
assert.equal(model.getModel().turns, 4, 'an interview is under way');

assert.equal(await post('/candidate', { name: 'Mallory', role: 'Anything' }), 400, 'a stranger cannot reset it');
assert.equal(model.getModel().turns, 4, 'and the interview still remembers every turn');
assert.equal(model.interview()?.code, real.code, 'and is still attached to the interview it belongs to');


// Signing in with the real code, while claiming a different role, bar and length.
assert.equal(
  await post('/candidate', {
    name: 'Ada', role: 'Frontend Engineer', level: 'Expert (6-11+ years)', durationMin: 15, code: real.code,
  }),
  200,
  'the candidate signs in',
);
assert.equal(model.profile()?.role, 'Backend Engineer', 'over HTTP too, the scheduled role wins');
assert.equal(model.profile()?.level, 'Intern', 'and the scheduled bar wins');
assert.equal(model.durationMin(), 5, 'and the scheduled length wins');

// Spending money needs the code.
assert.equal(await post('/agent/start', {}), 403, 'no code, no billable agent');
assert.equal(await post('/agent/start', { code: 'ZZZZZZ' }), 403, 'wrong code, no billable agent');

// Reading a verdict needs the code.
const card = async (q: string): Promise<Response> => fetch(`${base}/scorecard?duration=60${q}`);
assert.equal((await card('')).status, 403, 'no code, no scorecard');
assert.equal((await card('&code=ZZZZZZ')).status, 403, 'wrong code, no scorecard');

// The attack this closes: the portal hides mocks, so marking your own
// assessment as practice on the way out used to bury it where no recruiter
// would ever look.
const written = await (await card(`&code=${real.code}&mock=1`)).json() as { mock?: boolean };
assert.equal(written.mock, false, 'a candidate cannot mark their own assessment as practice');

server.close();

console.log('        the routes enforce it too, not just the model');
console.log('        and a live interview cannot be wiped by a stranger');
console.log('code    the role, the bar and the booked length come off the interview row');
console.log('        the code is the credential, and only the exact code passes');
console.log('        whether a result is practice is the company’s call, not the candidate’s');
console.log('\nself-check passed');
