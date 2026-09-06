import { Router, type Response } from 'express';
import type { SessionEvent } from '@kyro/shared';
import {
  AMBIENT_ID as AMBIENT,
  createSession,
  endSession,
  finish,
  getModel,
  getScorecardsHistory,
  inSession,
  liveSessions as live,
  profile,
  reset,
  saveScorecardToHistory,
  session as current,
  setProfile,
  type Session,
} from '../panel/model.js';
import { buildScorecard } from '../panel/scorecard.js';
import { recruiterId, requireRecruiter } from './auth.js';

// One-way push to the room UI: bids, captions, claims, state.
// SSE, not WebSocket — the browser never sends anything back on this channel.

const router = Router();

/**
 * Who is watching which interview.
 *
 * One set per session, not one set for the server. A single set meant every
 * browser on the deployment saw every candidate's bids, captions and claims —
 * which was invisible while only one interview could run at a time, and a
 * privacy incident the moment two could.
 */
const rooms = new Map<string, Set<Response>>();

/**
 * Proxies and tunnels close a connection that has been quiet too long, and the
 * browser's EventSource does not always notice — the room just stops updating.
 * A comment line every 20s keeps it alive and is ignored by the client.
 */
const KEEPALIVE_MS = 20_000;
setInterval(() => {
  for (const [id, clients] of rooms) for (const res of clients) write(id, res, ': keepalive\n\n');
}, KEEPALIVE_MS).unref();

/** A dead client throws on write; drop it rather than leaking the socket. */
function write(sessionId: string, res: Response, line: string): void {
  try {
    res.write(line);
  } catch {
    watchers(sessionId).delete(res);
  }
}

const watchers = (sessionId: string): Set<Response> => {
  let set = rooms.get(sessionId);
  if (!set) rooms.set(sessionId, (set = new Set()));
  return set;
};

/**
 * Pushes an event to the room watching THIS interview.
 *
 * The session comes from the async context rather than an argument, which is
 * what keeps every existing call site — bidding, the ledger, the routes —
 * unchanged and unable to broadcast into the wrong room by forgetting to pass
 * something.
 */
export function broadcast(event: SessionEvent): void {
  const id = current().id;
  // Read, never create. Going through watchers() here would leave an empty set
  // behind for every interview nobody happened to be watching — and since only
  // a closing client deletes one, they would accumulate for the life of the
  // process. A room with nobody in it is not a room to allocate.
  const clients = rooms.get(id);
  if (!clients?.size) return;

  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) write(id, res, line);
}

router.get('/events', (req, res) => {
  const id = current().id;
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    // Nginx and friends buffer streamed responses by default, which delays
    // every event until the buffer fills.
    'x-accel-buffering': 'no',
  });
  res.write(`data: ${JSON.stringify({ type: 'state', model: getModel() } satisfies SessionEvent)}\n\n`);

  const clients = watchers(id);
  clients.add(res);
  req.on('close', () => {
    clients.delete(res);
    if (clients.size === 0) rooms.delete(id);
  });
});

router.get('/state', (_req, res) => res.json(getModel()));

// Who is being interviewed, posted by the login screen before they join the
// room. The panel reads it to open by name and to probe the candidate's own
// background instead of a generic warm-up.
//
// This is also where an interview BEGINS. Signing in mints a session, and the
// id it returns is the only handle on that interview: the room passes it back
// on every later request, Agora is given a callback URL built from it, and the
// RTC channel is named after it. Nothing else identifies a candidate, so a
// caller who does not hold one cannot reach, watch or start anybody's session.
//
// Open on purpose: the browser has no shared secret, and this writes nothing
// the panel scores on. setProfile() is the trust boundary — it caps every field
// and strips control characters before any of it reaches an LLM prompt.
//
// Posting again WITH a session id re-signs into that same interview, which is
// what a page reload does. Without one it always starts a new interview — a
// second candidate must never land in the first one's transcript, which is
// exactly what the shared model used to do.
router.post('/candidate', (req, res) => {
  const existing = current();
  let started: Session;

  try {
    started = existing.id === AMBIENT ? createSession() : existing;
  } catch (err) {
    // The cap in model.ts. A 503 rather than a 500: nothing the caller sent is
    // wrong, and it will work again once an interview finishes.
    return res.status(503).json({ error: (err as Error).message });
  }

  const saved = inSession(started, () => setProfile(req.body));
  if (!saved) {
    if (started !== existing) endSession(started.id);
    return res.status(400).json({ error: 'name and role are required' });
  }

  inSession(started, () => {
    console.log(
      `[candidate] ${saved.name} — ${saved.role} (${saved.level || 'Intermediate'})` +
      (saved.resumeText ? ` | resume ${saved.resumeText.length} chars` : ' | no resume') +
      ` | session ${started.id.slice(0, 8)}… in ${started.channel} (${live()} live)`,
    );
    broadcast({ type: 'state', model: getModel() });
  });

  // The channel travels with the id so the room never constructs it itself —
  // one place decides what an interview's channel is called.
  res.json({ ...saved, sessionId: started.id, channel: started.channel });
});

// Wipes the session so the next demo run starts from an empty model. The
// profile survives unless ?forget=1 — the same candidate is still in the room.
router.post('/reset', (req, res) => {
  reset(req.query.forget === '1');
  broadcast({ type: 'state', model: getModel() });
  res.json({ ok: true });
});

// Ends the interview as far as the hiring team is concerned: build the three
// verdicts from the model as it stands and push them to anyone watching.
// The stored profile wins over the query string — it is what the panel heard.
router.get('/scorecard', async (req, res) => {
  const saved = profile();
  const customDuration = req.query.duration !== undefined ? Number(req.query.duration) : undefined;
  const scorecard = await buildScorecard(
    saved?.name ?? String(req.query.name ?? 'Candidate'),
    saved?.role ?? String(req.query.role || 'Senior Backend Engineer'),
    saved?.level ?? (req.query.level ? String(req.query.level) : undefined),
    customDuration,
    req.query.mock === '1',
  );
  // The room passes the invite code it joined with, which is what ties this
  // scorecard to the recruiter who scheduled it. A mock sends none.
  await saveScorecardToHistory(scorecard, req.query.code ? String(req.query.code) : null);
  broadcast({ type: 'scorecard', scorecard });

  // The interview is done. Nothing deletes the session here — the room may ask
  // for this same scorecard again — but this is what starts its short clock, so
  // a server that runs for weeks is not holding every interview it ever ran.
  finish();

  res.json(scorecard);
});

// Company portal: the assessments this recruiter's own interviews produced.
//
// Two things are excluded and neither is a filter the caller can lift. Another
// company's candidates, because ownership is joined through the interview. And
// mock interviews, which are practice a candidate ran on themselves — real
// results, but not hiring data, and owned by nobody.
router.get('/scorecards', requireRecruiter, async (_req, res) => {
  res.json(await getScorecardsHistory(recruiterId(res)));
});

export default router;
