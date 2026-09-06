// Run: npm run check -w server
//
// The whole path, once, end to end: a recruiter schedules, a candidate signs in,
// Agora posts turns, and a scorecard comes out the other side.
//
// Every piece of this already has its own check. What none of them cover is the
// join between them, which is where this app actually broke: the scorecard's
// competency matrix rendered nothing but em-dashes for months because the UI
// iterated one set of competency keys and the verdicts carried another. Both
// halves were individually "correct". Nothing failed. The page was just empty.
//
// So the assertion that matters most here is the boring one — the ratings a
// verdict carries are keyed by the competencies the product actually has.

import assert from 'node:assert';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { COMPETENCIES, type CompetencyId, type Scorecard } from '@kyro/shared';

process.env.AGORA_APP_ID = '00000000000000000000000000000001';
process.env.AGORA_APP_CERTIFICATE = '00000000000000000000000000000002';
process.env.ORCHESTRATOR_API_KEY = 'flow-secret';

const { withSession } = await import('../routes/session.js');
const { requireSecret } = await import('../routes/auth.js');
const eventRoutes = (await import('../routes/events.js')).default;
const llmRoutes = (await import('../routes/llm.js')).default;
const interviews = await import('../panel/interviews.js');
const { findSession } = await import('../panel/model.js');

const app = express();
app.use(express.json());
app.use(withSession);
app.use('/chat/completions', requireSecret);
app.use(eventRoutes);
app.use(llmRoutes);

const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

// ------------------------------------------------- 1. the company schedules

interviews.reset();
const OWNER = '11111111-1111-1111-1111-111111111111';
const booked = await interviews.create({
  candidateName: 'Ada Lovelace',
  role: 'Product Engineer',
  level: 'Intermediate (2-6 years)',
  ownerId: OWNER,
});
for (const role of ['Platform Engineer', 'Site Reliability Engineer']) {
  await interviews.create({ candidateName: 'someone else', role, level: 'Intermediate (2-6 years)', ownerId: OWNER });
}

const open = await interviews.otherRoles(booked.code);
assert.deepEqual(open, ['Platform Engineer', 'Site Reliability Engineer'], 'the other roles this company has open');
assert.ok(!open.includes('Product Engineer'), 'never the role they are already being interviewed for');

// Another company's roles are not this company's business.
const rival = await interviews.create({
  candidateName: 'nobody', role: 'Staff Compiler Engineer', level: 'Expert (6-11+ years)',
  ownerId: '22222222-2222-2222-2222-222222222222',
});
assert.ok(
  !(await interviews.otherRoles(booked.code)).includes('Staff Compiler Engineer'),
  'a suggestion must never name a role belonging to a different company',
);
assert.deepEqual(await interviews.otherRoles(rival.code), [], 'and the boundary holds from both sides');

// ------------------------------------------------ 2. the candidate signs in

const signIn = await fetch(`${base}/candidate`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Ada Lovelace', role: 'Product Engineer', level: 'Intermediate (2-6 years)' }),
});
assert.equal(signIn.status, 200, 'signing in starts the interview');
const { sessionId, channel } = (await signIn.json()) as { sessionId: string; channel: string };
assert.ok(sessionId && channel, 'and hands back the session and its channel');

// ------------------------------------------------------- 3. Agora posts turns

const ANSWERS = [
  "Hi, I'm Ada. Last two years I owned our deploy pipeline and the on-call rotation.",
  'I rebuilt CI so a release went from forty minutes to six, and cut flaky reruns by half.',
  'We sharded the write path by tenant because a few noisy tenants held locks.',
  'I never picked up the product side — I could not tell you our activation rate.',
];

for (const said of ANSWERS) {
  const res = await fetch(`${base}/s/${sessionId}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.ORCHESTRATOR_API_KEY}` },
    body: JSON.stringify({ messages: [{ role: 'user', content: said }] }),
  });
  assert.equal(res.status, 200, 'every turn must reach the panel');
  const sse = await res.text();
  assert.ok(sse.includes('chat.completion.custom_metadata'), 'each turn names the voice that answers it');
  assert.ok(/"content":"[^"]/.test(sse), 'and carries words for that voice to say');
}

const mid = await (await fetch(`${base}/state?session=${sessionId}`)).json();
assert.equal((mid as { turns: number }).turns, ANSWERS.length, 'every answer was counted');

// ------------------------------------------------------- 4. the scorecard

const res = await fetch(`${base}/scorecard?session=${sessionId}&code=${booked.code}&duration=600`);
assert.equal(res.status, 200, 'the scorecard must be produced');
const card = (await res.json()) as Scorecard;

assert.equal(card.candidateName, 'Ada Lovelace');
assert.equal(card.durationSec, 600, 'the duration the room measured wins');
assert.equal(card.turns, ANSWERS.length);
assert.equal(card.verdicts.length, 3, 'three verdicts, never averaged into one');

const valid = new Set(Object.keys(COMPETENCIES));
for (const v of card.verdicts) {
  // THE assertion. A verdict whose ratings are keyed by anything else renders
  // as a table of dashes, and renders that way silently.
  const keys = Object.keys(v.ratings) as CompetencyId[];
  assert.ok(keys.length > 0, `${v.panelist} must rate something`);
  for (const k of keys) {
    assert.ok(valid.has(k), `${v.panelist} rated "${k}", which is not a competency this product has`);
    assert.ok(
      typeof v.ratings[k] === 'number' && v.ratings[k]! >= 0 && v.ratings[k]! <= 5,
      `${v.panelist}'s ${k} must be a number out of five, not ${String(v.ratings[k])}`,
    );
  }
  assert.ok(v.rationale.trim().length > 0, `${v.panelist} must say why`);

  // Evidence is quoted, so it has to be something the candidate really said.
  for (const e of v.evidence) {
    const spoken = ANSWERS.some(a => a.startsWith(e.quote.replace(/…$/, '')));
    assert.ok(spoken, `${v.panelist} quoted something the candidate never said: ${e.quote}`);
  }
}

// ---------------------------------------------- 5. and the interview is over

const finished = findSession(sessionId);
assert.ok(finished?.finishedAt, 'handing over the scorecard ends the interview');

// The room retries this GET, and the second answer must be the same card rather
// than a new session id or a 404.
const again = (await (await fetch(`${base}/scorecard?session=${sessionId}&code=${booked.code}&duration=600`)).json()) as Scorecard;
assert.equal(again.sessionId, card.sessionId, 'a retry corrects the same scorecard, it does not make a second one');

server.close();

console.log('flow  schedule -> sign in -> turns over Agora\'s callback -> scorecard');
console.log('      verdict ratings are keyed by competencies this product has');
console.log('      every quote on the card is something the candidate really said');
console.log('      one company\'s open roles never leak into another\'s suggestion');
console.log('\nself-check passed');
