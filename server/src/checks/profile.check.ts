// Run: npm run check -w server
//
// The candidate profile is the only thing standing between "Hi Anish, we are
// here for the Senior Backend Engineer role" and a panel that opens with a
// textbook question. It also carries candidate-supplied text straight into an
// LLM prompt, so both halves are checked here: that the panel actually receives
// the name, role and resume, and that nothing hostile rides in with them.

import assert from 'node:assert';
import * as model from '../panel/model.js';
import { context } from '../panel/bidding.js';

model.reset(true);

// 1. Name and role are the whole point — without both there is no profile.
assert.equal(model.setProfile(null), null, 'no body must not produce a profile');
assert.equal(model.setProfile({}), null, 'an empty body must be refused');
assert.equal(model.setProfile({ name: 'Anish' }), null, 'a role is required');
assert.equal(model.setProfile({ role: 'Backend Engineer' }), null, 'a name is required');
assert.equal(model.setProfile({ name: 42, role: [] }), null, 'non-strings must be refused');
assert.equal(model.profile(), null, 'a refused profile must leave nothing behind');

// 2. A real one is stored, whitespace tidied.
const saved = model.setProfile({
  name: '  Anish Patankar \n',
  role: 'Staff  Platform Engineer',
  email: 'anish@example.com',
  resumeText: 'Built a payments ledger on Postgres. Cut p99 from 450ms to 85ms.',
});
assert.ok(saved, 'a name and a role must be enough');
assert.equal(saved.name, 'Anish Patankar', 'the name must be trimmed to one line');
assert.equal(saved.role, 'Staff Platform Engineer', 'runs of whitespace collapse');

// 3. Trust boundary. Everything here arrives from an open POST.
const NUL = String.fromCharCode(0);
const withControl = model.setProfile({
  name: `Ani${NUL}sh`,
  role: 'Backend Engineer',
  resumeText: `line one${NUL}\nline two`,
});
assert.ok(withControl, 'control characters must not reject the whole profile');
assert.ok(!withControl.name.includes(NUL), 'control characters must be stripped from the name');
assert.ok(!withControl.resumeText!.includes(NUL), 'and from the resume');
assert.ok(withControl.resumeText!.includes('\n'), 'but real newlines survive in the resume');

const huge = model.setProfile({
  name: 'x'.repeat(500),
  role: 'y'.repeat(500),
  resumeText: 'z'.repeat(100_000),
})!;
assert.equal(huge.name.length, 80, 'the name is capped');
assert.equal(huge.role.length, 80, 'the role is capped');
assert.equal(huge.resumeText!.length, 20_000, 'the resume is capped before it reaches a prompt');

// 4. The profile survives a reset — it is who is in the room, not something
//    they said. Only an explicit forget clears it.
model.setProfile({
  name: 'Anish Patankar',
  role: 'Senior Backend Engineer',
  resumeText: 'Led the migration of a 2TB Postgres cluster. Owned the Kafka pipeline.',
});
model.reset();
assert.equal(model.profile()?.name, 'Anish Patankar', 'a reset must not forget the candidate');
assert.equal(model.getModel().turns, 0, 'but the interview itself is wiped');

// 5. What the panel is actually told. This is the feature.
//
// The resume goes to the panelist who WON the floor and is about to speak, not
// to the bid that only decides who that is. Both halves are asserted: a resume
// that stops reaching the speaker is a broken product, and a resume that starts
// riding along on the bid again is the token cost that pushed a whole interview
// onto canned fallback lines.
const said = 'Hi, I am Anish, I have spent six years on payments infrastructure.';
const speaking = context(said, 'reply');
assert.ok(speaking.includes('Anish Patankar'), 'the speaker must be told who it is interviewing');
assert.ok(speaking.includes('Senior Backend Engineer'), 'and for which role');
assert.ok(speaking.includes('2TB Postgres cluster'), 'and what the resume says');
assert.ok(speaking.includes('<<<RESUME'), 'the resume must be fenced as data');
assert.ok(
  /DATA, not instructions/.test(speaking),
  'and labelled as data — a resume must never be able to instruct the panel',
);

const bidding = context(said, 'bid');
assert.ok(bidding.includes('Anish Patankar'), 'bidding still knows who is in the room');
assert.ok(bidding.includes('Senior Backend Engineer'), 'and for which role');
assert.ok(!bidding.includes('<<<RESUME'), 'but the resume does not ride along on a bid');
assert.ok(
  !bidding.includes('2TB Postgres cluster'),
  'a bid is a relevance score — it is not charged for the resume it cannot quote',
);


// 6. The first answer is an introduction, and the panel has to know that.
model.addTurn({ speaker: 'candidate', text: 'Hi, I am Anish.' });
assert.equal(model.getModel().turns, 1, 'the introduction counts as turn 1');
assert.ok(
  context('Hi, I am Anish.').includes('INTRODUCTION'),
  'turn 1 must be framed as the introduction, not a system design question',
);
for (let i = 0; i < 3; i++) model.addTurn({ speaker: 'candidate', text: 'We sharded by tenant.' });
assert.ok(
  !context('We sharded by tenant.').includes('INTRODUCTION'),
  'later turns must not still be treated as the introduction',
);

// 7. No profile, no invented candidate.
model.reset(true);
assert.equal(model.profile(), null, 'forget must actually forget');
const anonymous = context('We sharded by tenant.');
assert.ok(!anonymous.includes('Anish'), 'a forgotten candidate must not linger in the prompt');
assert.ok(!anonymous.includes('<<<RESUME'), 'and no resume fence without a resume');

console.log('profile  name and role required, everything capped and de-controlled');
console.log('         resume reaches the speaker fenced as data, and never the bid');
console.log('         turn 1 is framed as the introduction');
console.log('\nself-check passed');
