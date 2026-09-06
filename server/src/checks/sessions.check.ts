// Run: npm run check -w server
//
// Two candidates, at the same time, must not be able to reach each other.
//
// This is the check the old code could not have: there was one interview in
// memory, one RTC channel, and one set of SSE clients, so a second candidate
// signing in overwrote the first one's transcript and every browser on the
// deployment watched whichever interview happened to be live. Nothing failed
// loudly when that happened — the room kept working — which is exactly why it
// needs a test rather than a careful reading.
//
// Driven through a real express app on loopback, because the isolation lives in
// the middleware and the routes as much as in the model.

import assert from 'node:assert';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { CandidateModel } from '@kyro/shared';

process.env.AGORA_APP_ID = '00000000000000000000000000000001';
process.env.AGORA_APP_CERTIFICATE = '00000000000000000000000000000002';
process.env.ORCHESTRATOR_API_KEY = 'check-secret';

const { withSession } = await import('../routes/session.js');
const { requireSecret } = await import('../routes/auth.js');
const eventRoutes = (await import('../routes/events.js')).default;
const llmRoutes = (await import('../routes/llm.js')).default;
const { issueToken } = await import('../routes/token.js');

// Mounted in the same order as index.ts. The order is the thing under test as
// much as the routes are: withSession has to strip Agora's /s/<id> prefix
// before requireSecret is matched against the path it guards.
const app = express();
app.use(express.json());
app.use(withSession);
app.use('/chat/completions', requireSecret);
app.use(eventRoutes);
app.use(llmRoutes);

const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

interface SignIn { name: string; role: string; sessionId: string; channel: string }

const signIn = async (name: string, role: string, session?: string): Promise<SignIn> => {
  const res = await fetch(`${base}/candidate${session ? `?session=${session}` : ''}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, role }),
  });
  assert.equal(res.status, 200, `sign-in for ${name} should succeed`);
  return res.json() as Promise<SignIn>;
};

/** One turn, shaped exactly as Agora sends it — prefixed path, secret header. */
const turn = async (session: string, said: string): Promise<number> => {
  const res = await fetch(`${base}/s/${session}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.ORCHESTRATOR_API_KEY}`,
    },
    body: JSON.stringify({ messages: [{ role: 'user', content: said }] }),
  });
  // Drain the SSE body so the connection closes before the next assertion.
  await res.text();
  return res.status;
};

const state = async (session: string): Promise<CandidateModel> => {
  const res = await fetch(`${base}/state?session=${session}`);
  assert.equal(res.status, 200, 'state should be readable with a valid session');
  return res.json() as Promise<CandidateModel>;
};

// ---------------------------------------------------------------- identity

const ada = await signIn('Ada Lovelace', 'Backend Engineer');
const grace = await signIn('Grace Hopper', 'Frontend Engineer');

assert.notEqual(ada.sessionId, grace.sessionId, 'two sign-ins are two interviews');
assert.match(ada.sessionId, /^[0-9a-f]{32}$/, 'the id is 128 bits of randomness, not a timestamp');
assert.notEqual(ada.channel, grace.channel, 'and two channels');

// ------------------------------------------------------------------- state

assert.equal((await state(ada.sessionId)).profile?.name, 'Ada Lovelace');
assert.equal((await state(grace.sessionId)).profile?.name, 'Grace Hopper', 'the second sign-in must not have overwritten the first');

// Signing in again with the id re-enters the SAME interview — a page reload
// must not strand the candidate in a new one and orphan the running agent.
const back = await signIn('Ada Lovelace', 'Backend Engineer', ada.sessionId);
assert.equal(back.sessionId, ada.sessionId, 'signing in with a session id keeps that session');

// An id that names nothing is refused rather than silently falling through to
// the ambient interview, which is where a stranger's answers used to land.
assert.equal((await fetch(`${base}/state?session=deadbeef`)).status, 404, 'an unknown session is a 404');

// ------------------------------------------------------------------ tokens

assert.ok(!('error' in issueToken(ada.channel, '10042')), 'a live interview mints for its own channel');
const crossed = issueToken(`${ada.channel}x`, '10042');
assert.ok('error' in crossed && crossed.code === 403, 'a channel with no interview behind it mints nothing');

// ------------------------------------------------------- event isolation

/** Opens an SSE stream and collects frames until `stop()` is called. */
function watch(session: string) {
  const control = new AbortController();
  const frames: string[] = [];
  const ready = fetch(`${base}/events?session=${session}`, { signal: control.signal }).then(async res => {
    assert.equal(res.status, 200, 'the event stream should open');
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          for (const line of decoder.decode(value, { stream: true }).split('\n')) {
            if (line.startsWith('data:')) frames.push(line.slice(5).trim());
          }
        }
      } catch {
        // The abort below is how this loop is meant to end.
      }
    })();
  });
  return { ready, frames, stop: () => control.abort() };
}

const adaFeed = watch(ada.sessionId);
const graceFeed = watch(grace.sessionId);
await Promise.all([adaFeed.ready, graceFeed.ready]);

// Each stream opens with its own interview's state and nobody else's.
assert.equal(adaFeed.frames.length, 1, 'the stream opens with exactly one state frame');
assert.ok(adaFeed.frames[0].includes('Ada Lovelace'), 'and it is the right candidate');
assert.ok(graceFeed.frames[0].includes('Grace Hopper'), 'for both of them');

const adaOpening = adaFeed.frames.length;
const graceOpening = graceFeed.frames.length;

// Something happens in Grace's interview. Ada's room must not hear about it.
await signIn('Grace Hopper', 'Staff Frontend Engineer', grace.sessionId);
await new Promise(r => setTimeout(r, 50));

assert.ok(graceFeed.frames.length > graceOpening, "Grace's room sees Grace's update");
assert.equal(adaFeed.frames.length, adaOpening, "Ada's room hears nothing about Grace");
assert.ok(
  !adaFeed.frames.some(f => f.includes('Grace')),
  "no frame on Ada's stream has ever mentioned another candidate",
);

// -------------------------------------------------- Agora's callback path

// The one path in this change that nothing else covers, and the one that is
// silent when it breaks: Agora posts every turn to /s/<id>/chat/completions
// from its own cloud. If the prefix does not rewrite down to the route, or the
// secret is checked against the wrong path, the panel simply never answers and
// the room looks like it is thinking forever.
assert.equal(
  await turn(ada.sessionId, 'We put a payment queue in front of Redis so writes never block.'),
  200,
  "Agora's own callback shape must reach the panel",
);

const scored = await state(ada.sessionId);
assert.equal(scored.turns, 1, 'the answer was scored against the session in the URL');
assert.equal(scored.transcript[0].text.startsWith('We put a payment queue'), true, 'and into its transcript');
assert.equal((await state(grace.sessionId)).turns, 0, 'and into nobody else’s');

// The same body without a session is a 404, not a turn scored on the ambient
// interview — an Agora agent from an expired session must not be able to keep
// talking into a shared transcript.
assert.equal(await turn('deadbeefdeadbeefdeadbeefdeadbeef', 'hello'), 404, 'an expired agent is refused');

// ------------------------------------------------ surviving a restart

// The host this deploys to sleeps after fifteen quiet minutes, and every
// interview lives in memory, so "the server has never heard of your session" is
// a normal Tuesday rather than an edge case. The web app is expected to drop
// the dead id and start a fresh interview; what the SERVER must do is say 404
// so it can tell the difference — not quietly accept the request into the
// ambient interview, which is how a stranger's answers got shared before.
assert.equal(
  (await fetch(`${base}/candidate?session=${'0'.repeat(32)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ada Lovelace', role: 'Backend Engineer' }),
  })).status,
  404,
  'signing in with a forgotten id must be refused, so the client knows to retry clean',
);

// And the retry the client then makes — same body, no id — has to work.
const recovered = await signIn('Ada Lovelace', 'Backend Engineer');
assert.match(recovered.sessionId, /^[0-9a-f]{32}$/, 'a clean retry starts a real interview');
assert.notEqual(recovered.sessionId, ada.sessionId, 'and a new one, not the old id back again');
assert.ok(!('error' in issueToken(recovered.channel, '10042')), 'which can mint its own token');

// --------------------------------------------------- finished interviews

// A server that never restarts — which is what an uptime pinger guarantees —
// only reclaims memory through the sweep. Before the scorecard marked an
// interview finished, every completed one sat in the map for the full two-hour
// idle TTL, and fifty of those in one afternoon is MAX_SESSIONS reached by
// interviews that all ended hours ago. The next candidate got a 503.
{
  const { findSession, sweep, liveSessions } = await import('../panel/model.js');

  const done = await signIn('Katherine Johnson', 'Data Engineer');
  const before = liveSessions();

  // Handing over the scorecard is what ends it.
  const card = await fetch(`${base}/scorecard?session=${done.sessionId}&duration=600`);
  assert.equal(card.status, 200, 'the scorecard must still be served');
  await card.json();

  const finished = findSession(done.sessionId);
  assert.ok(finished, 'the session survives the scorecard — the room may ask again');
  assert.ok(finished.finishedAt !== null, 'and is marked finished');

  // Still there a moment later: the room retries this GET, and a second call
  // must not push the eviction further out either.
  const stamp = finished.finishedAt;
  await fetch(`${base}/scorecard?session=${done.sessionId}&duration=600`).then(r => r.json());
  assert.equal(findSession(done.sessionId)!.finishedAt, stamp, 'a retry does not restart the clock');
  assert.equal(liveSessions(), before, 'and does not drop it early');

  // Wound past the grace window, the sweep reclaims it — while a live
  // interview sitting right next to it is untouched.
  finished.finishedAt = Date.now() - 11 * 60 * 1000;
  sweep();
  assert.equal(findSession(done.sessionId), null, 'a finished interview is reclaimed after its grace window');
  assert.ok(findSession(grace.sessionId), 'a live interview is not');
}

adaFeed.stop();
graceFeed.stop();
server.close();

console.log('sessions  two interviews, two channels, two event streams');
console.log('          an unknown id is refused, not quietly shared');
console.log('          a channel mints only while its own interview is live');
console.log("          Agora's /s/<id>/chat/completions reaches the right interview");
console.log('          a forgotten id is refused, and signing in clean recovers');
console.log('          a finished interview is reclaimed, a live one is not');
console.log('\nself-check passed');
