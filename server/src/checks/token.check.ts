// Run: npm run check -w server
//
// /token has no secret to check, so these bounds are the only thing stopping a
// public URL from minting publisher tokens for the whole Agora project. A
// regression here is silent — the room keeps working either way.

import assert from 'node:assert';

process.env.AGORA_APP_ID = '00000000000000000000000000000001';
process.env.AGORA_APP_CERTIFICATE = '00000000000000000000000000000002';
process.env.AGORA_CHANNEL = 'demo-channel';

const { issueToken } = await import('../routes/token.js');
const { AGENT_UID } = await import('../panel/tokens.js');

const refusal = (channel: string, uid: string) => {
  const r = issueToken(channel, uid);
  assert.ok('error' in r, `${channel}/${uid} must be refused`);
  return r.code;
};

const ok = issueToken('demo-channel', '10042');
assert.ok(!('error' in ok), 'the configured channel with a normal uid must pass');
assert.equal(ok.channel, 'demo-channel');
assert.equal(ok.uid, 10042);
assert.ok(ok.token && ok.rtmToken, 'both an RTC and an RTM token come back');

// The candidate uid is random per session (web/src/lib/agora.ts), so the bound
// is the channel and the reserved uid — not an allowlist of numbers.
assert.ok(!('error' in issueToken('demo-channel', '99999')), 'any session uid passes');

assert.equal(refusal('other-channel', '10042'), 403, 'another channel is refused');
assert.equal(refusal('', '10042'), 400, 'a missing channel is a 400');
assert.equal(refusal('demo-channel', String(AGENT_UID)), 403, "the panel's uid is reserved");
assert.equal(refusal('demo-channel', 'abc'), 400, 'a non-numeric uid is refused');
assert.equal(refusal('demo-channel', '0'), 400, 'uid 0 lets Agora assign one — refused');

// An unconfigured server must refuse, not fall back to a default channel.
delete process.env.AGORA_CHANNEL;
assert.equal(refusal('demo-channel', '10042'), 503, 'no AGORA_CHANNEL means refuse everything');
process.env.AGORA_CHANNEL = 'demo-channel';

delete process.env.AGORA_APP_CERTIFICATE;
assert.equal(refusal('demo-channel', '10042'), 500, 'missing credentials still say 500');

console.log('token  the configured channel mints, every other channel is refused');
console.log("       the panel's uid and uid 0 are never handed out");
console.log('\nself-check passed');
