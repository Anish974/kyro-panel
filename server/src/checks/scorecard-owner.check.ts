// Run: npm run check -w server
//
// The company portal's boundary, on the path that has no database.
//
// Ownership is never stored on a scorecard. It is derived through the interview
// that produced it, which is what the SQL join does — and what the in-memory
// fallback did not do at all. It returned the whole list to whoever asked, so
// one recruiter's portal listed every other company's candidates and every mock
// anyone had ever run. These assertions run with DATABASE_URL unset, which is
// exactly the path that was wrong.

import assert from 'node:assert';
import type { Scorecard } from '@kyro/shared';
import { create, reset as resetInterviews } from '../panel/interviews.js';
import { getScorecardsHistory, saveScorecardToHistory } from '../panel/model.js';

assert.ok(!process.env.DATABASE_URL, 'this check must run against the in-memory path');

resetInterviews();

const ACME = '11111111-1111-1111-1111-111111111111';
const RIVAL = '22222222-2222-2222-2222-222222222222';

const card = (sessionId: string, candidateName: string, mock = false): Scorecard => ({
  sessionId,
  candidateName,
  role: 'Backend Engineer',
  level: 'Intermediate (2-6 years)',
  durationSec: 600,
  turns: 10,
  dissent: false,
  mock,
  verdicts: [],
  claims: [],
  timestamp: Date.now(),
});

const acmeInterview = await create({
  candidateName: 'Acme Candidate', role: 'Backend Engineer', level: 'Intermediate (2-6 years)', ownerId: ACME,
});
const rivalInterview = await create({
  candidateName: 'Rival Candidate', role: 'Backend Engineer', level: 'Intermediate (2-6 years)', ownerId: RIVAL,
});

await saveScorecardToHistory(card('s-acme', 'Acme Candidate'), acmeInterview.code);
await saveScorecardToHistory(card('s-rival', 'Rival Candidate'), rivalInterview.code);
// Practice the candidate ran on themselves: a real result, but not hiring data.
await saveScorecardToHistory(card('s-mock', 'Practising Candidate', true), null);
// A session that ended without a code — it belongs to no interview, so it
// belongs to no company either.
await saveScorecardToHistory(card('s-orphan', 'Nobody In Particular'), null);

const acme = await getScorecardsHistory(ACME);
const rival = await getScorecardsHistory(RIVAL);

assert.deepEqual(acme.map(s => s.sessionId), ['s-acme'], 'a recruiter sees their own candidate');
assert.deepEqual(rival.map(s => s.sessionId), ['s-rival'], 'and only their own');

for (const [who, list] of [['acme', acme], ['rival', rival]] as const) {
  assert.ok(!list.some(s => s.mock), `${who} was shown a mock interview`);
  assert.ok(!list.some(s => s.sessionId === 's-orphan'), `${who} was shown an unowned scorecard`);
}

// The one that actually bit: an owner nobody has scheduled anything for must
// come back empty, not with everything the process happens to be holding.
assert.deepEqual(
  await getScorecardsHistory('33333333-3333-3333-3333-333333333333'),
  [],
  'a recruiter with no interviews sees nothing, not the whole list',
);

console.log('owner   a scorecard belongs to whoever owns the interview behind it');
console.log('        mocks and unowned sessions belong to nobody and reach nobody');
console.log('        with no database, the portal is scoped the same way the join is');
console.log('\nself-check passed');
