// Run: npm run check -w server
//
// The exact sequence a browser makes, in order, against the real routes.
//
// The invite code became a credential, and a credential the client forgets to
// send is an outage: every /agent/start would 403 and no interview could begin
// at all. Type-checking cannot catch that — the code reaches the server as a
// field in a JSON body, and a missing field is a perfectly valid object.
//
// So this walks the whole join: resolve the invite, sign in, re-sync on join,
// start the panel, write the card, stop the panel. Nothing here may 403.

import assert from 'node:assert';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { create, reset as resetInterviews } from '../panel/interviews.js';
import * as model from '../panel/model.js';

const app = express();
app.use(express.json());
app.use((await import('../routes/events.js')).default);
app.use((await import('../routes/agent.js')).default);
app.use((await import('../routes/interviews.js')).default);

const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

resetInterviews();
model.reset(true);

const booked = await create({
  candidateName: 'Ada Lovelace',
  role: 'Backend Engineer',
  level: 'Intermediate (2-6 years)',
  durationMin: 5,
  ownerId: '11111111-1111-1111-1111-111111111111',
});

/** Anything that 403s here is the gate locking out the real candidate. */
const notForbidden = (status: number, step: string) =>
  assert.notEqual(status, 403, `${step} was refused — the room cannot present its own code`);

// 1. App resolves the invite from ?i=CODE.
const resolved = await fetch(`${base}/interviews/${booked.code}`);
assert.equal(resolved.status, 200, 'the invite link resolves');
const invite = await resolved.json() as { code: string; role: string; durationMin: number };
assert.equal(invite.durationMin, 5, 'and carries the booked length to the browser');

// 2. Login posts the profile, with the code the invite carried.
const signIn = await fetch(`${base}/candidate`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    name: 'Ada Lovelace',
    role: invite.role,
    level: 'Intermediate (2-6 years)',
    durationMin: invite.durationMin,
    code: invite.code,
  }),
});
notForbidden(signIn.status, 'signing in');
assert.equal(signIn.status, 200, 'the candidate signs in');

// 3. The room re-syncs the same profile when it joins.
const resync = await fetch(`${base}/candidate`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Ada Lovelace', role: invite.role, level: 'Intermediate (2-6 years)', durationMin: 5, code: invite.code }),
});
notForbidden(resync.status, 'the room re-syncing on join');
assert.equal(model.durationMin(), 5, 'and the booked length survives the re-sync');

// 4. The room starts the panel.
//
// There are no Agora credentials in a self-check, so this cannot succeed — but
// it must fail on the missing configuration (503) rather than on the gate. A
// 403 here is the whole product broken.
const start = await fetch(`${base}/agent/start`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: invite.code }),
});
notForbidden(start.status, 'starting the panel');
assert.equal(start.status, 503, 'it gets as far as needing Agora credentials');

// 5. The interview ends and the room asks for the card.
const card = await fetch(`${base}/scorecard?duration=300&code=${invite.code}`);
notForbidden(card.status, 'asking for the scorecard');
assert.equal(card.status, 200, 'the card comes back');
const written = await card.json() as { mock: boolean; durationSec: number };
assert.equal(written.mock, false, 'a scheduled assessment is not filed as practice');

// 6. And the room stops the panel — including the unload path, which is a
// sendBeacon and can only put the code in the query string.
const stop = await fetch(`${base}/agent/stop?code=${invite.code}`, { method: 'POST' });
notForbidden(stop.status, 'stopping the panel on unload');
assert.equal(stop.status, 200, 'the beacon-shaped stop is accepted');

// A stop from anywhere else is still refused, which is the point of gating it.
const stranger = await fetch(`${base}/agent/stop?code=ZZZZZZ`, { method: 'POST' });
assert.equal(stranger.status, 403, 'a stranger cannot end somebody else’s interview');

server.close();

console.log('join    invite -> sign in -> re-sync -> start -> scorecard -> stop');
console.log('        every step carries the code, and none of them is refused');
console.log('        a stop without the code still is');
console.log('\nself-check passed');
