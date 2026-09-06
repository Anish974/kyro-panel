// Run: npm run check -w server
//
// /token has no secret to check, so these bounds are the only thing stopping a
// public URL from minting publisher tokens for the whole Agora project. A
// regression here is silent — the room keeps working either way.

import assert from 'node:assert';

process.env.AGORA_APP_ID = '00000000000000000000000000000001';
process.env.AGORA_APP_CERTIFICATE = '00000000000000000000000000000002';
// Every deployment that predates per-interview channels still has this set.
// Leaving it set for the whole check is the point: it must buy nobody anything.
process.env.AGORA_CHANNEL = 'demo-channel';

const { issueToken } = await import('../routes/token.js');
const { AGENT_UID } = await import('../panel/tokens.js');
const { createSession, endSession } = await import('../panel/model.js');

const refusal = (channel: string, uid: string) => {
  const r = issueToken(channel, uid);
  assert.ok('error' in r, `${channel}/${uid} must be refused`);
  return r.code;
};

// A channel is real because an interview is running in it — nothing else makes
// one real. This is the bound that replaced the single shared channel.
const mine = createSession();
const theirs = createSession();
assert.notEqual(mine.channel, theirs.channel, 'every interview gets its own channel');

const ok = issueToken(mine.channel, '10042');
assert.ok(!('error' in ok), 'a live interview mints for its own channel');
assert.equal(ok.channel, mine.channel);
assert.equal(ok.uid, 10042);
assert.ok(ok.token && ok.rtmToken, 'both an RTC and an RTM token come back');

// The candidate uid is random per session (web/src/lib/agora.ts), so the bound
// is the channel and the reserved uid — not an allowlist of numbers.
assert.ok(!('error' in issueToken(mine.channel, '99999')), 'any session uid passes');

assert.equal(refusal('other-channel', '10042'), 403, 'a channel with no interview is refused');
assert.equal(refusal('', '10042'), 400, 'a missing channel is a 400');
assert.equal(refusal(mine.channel, String(AGENT_UID)), 403, "the panel's uid is reserved");
assert.equal(refusal(mine.channel, 'abc'), 400, 'a non-numeric uid is refused');
assert.equal(refusal(mine.channel, '0'), 400, 'uid 0 lets Agora assign one — refused');

// The old shared channel is configured, and buys nothing. Before per-interview
// channels this handed a publisher token to anyone who asked, which is how a
// stranger walked into whichever interview happened to be live.
assert.equal(refusal('demo-channel', '10042'), 403, 'AGORA_CHANNEL mints nothing on its own');

// One interview cannot reach another, and ending one ends only that one.
assert.ok(!('error' in issueToken(theirs.channel, '10042')), 'the other interview mints for itself');
endSession(mine.id);
assert.equal(refusal(mine.channel, '10042'), 403, 'an ended interview mints nothing');
assert.ok(!('error' in issueToken(theirs.channel, '10042')), 'ending one does not end the other');

delete process.env.AGORA_APP_CERTIFICATE;
assert.equal(refusal(theirs.channel, '10042'), 500, 'missing credentials still say 500');
endSession(theirs.id);

console.log('token  a channel mints only while an interview is live in it');
console.log('       every interview gets its own channel, and cannot mint for another');
console.log('       AGORA_CHANNEL alone mints nothing, however it is set');
console.log("       the panel's uid and uid 0 are never handed out");
console.log('\nself-check passed');
