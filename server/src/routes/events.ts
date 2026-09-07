import { Router, type Response } from 'express';
import type { SessionEvent } from '@kyro/shared';
import {
  getModel,
  getScorecardsHistory,
  interview as sessionInterview,
  ownsSession,
  profile,
  reset,
  saveScorecardToHistory,
  setProfile,
} from '../panel/model.js';
import { find as findInterview } from '../panel/interviews.js';
import { buildScorecard } from '../panel/scorecard.js';
import { recruiterId, requireRecruiter } from './auth.js';

// One-way push to the room UI: bids, captions, claims, state.
// SSE, not WebSocket — the browser never sends anything back on this channel.

const router = Router();
const clients = new Set<Response>();

/**
 * Proxies and tunnels close a connection that has been quiet too long, and the
 * browser's EventSource does not always notice — the room just stops updating.
 * A comment line every 20s keeps it alive and is ignored by the client.
 */
const KEEPALIVE_MS = 20_000;
setInterval(() => {
  for (const res of clients) write(res, ': keepalive\n\n');
}, KEEPALIVE_MS).unref();

/** A dead client throws on write; drop it rather than leaking the socket. */
function write(res: Response, line: string): void {
  try {
    res.write(line);
  } catch {
    clients.delete(res);
  }
}

export function broadcast(event: SessionEvent): void {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) write(res, line);
}

router.get('/events', (req, res) => {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    // Nginx and friends buffer streamed responses by default, which delays
    // every event until the buffer fills.
    'x-accel-buffering': 'no',
  });
  res.write(`data: ${JSON.stringify({ type: 'state', model: getModel() } satisfies SessionEvent)}\n\n`);

  clients.add(res);
  req.on('close', () => { clients.delete(res); });
});

router.get('/state', (_req, res) => res.json(getModel()));

// Who is being interviewed, posted by the login screen before they join the
// room. The panel reads it to open by name and to probe the candidate's own
// background instead of a generic warm-up.
//
// Open on purpose: the browser has no shared secret, and this writes nothing
// the panel scores on. setProfile() is the trust boundary — it caps every field
// and strips control characters before any of it reaches an LLM prompt.
//
// ponytail: last write wins, one candidate at a time. Key it by session when
// the server stops holding a single interview.
router.post('/candidate', async (req, res) => {
  // The code is the one thing here that is checked rather than trusted. What it
  // resolves to — the role, the bar, the booked length, whether this counts as
  // hiring data — replaces whatever the body claimed about them.
  //
  // Required, because this route RESETS the session. Open, it was a way to
  // destroy an interview in progress from nothing but the hostname: one POST
  // wiped the transcript, the claims and the turn count, detached the session
  // from the interview it belonged to, and left the scorecard to be written
  // from an empty model and filed against nobody. The panel kept listening and
  // remembered none of it.
  //
  // This is not a sign-in. A mock candidate never logs in either — the server
  // hands their browser a code the moment they press start, and that is the
  // code they present here.
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!code) {
    return res.status(400).json({ error: 'an interview code is required' });
  }
  const interview = await findInterview(code);
  if (!interview) {
    return res.status(404).json({ error: 'no interview for that code' });
  }

  const saved = setProfile(req.body, interview);
  if (!saved) {
    return res.status(400).json({ error: 'name and role are required' });
  }
  console.log(
    `[candidate] ${saved.name} — ${saved.role} (${saved.level || 'Intermediate'})` +
    ` | ${getModel().durationMin}min` +
    (interview ? ` | ${interview.mock ? 'mock' : 'assessment'} ${interview.code}` : ' | no invite code') +
    (saved.resumeText ? ` | resume ${saved.resumeText.length} chars` : ' | no resume'),
  );
  broadcast({ type: 'state', model: getModel() });
  res.json(saved);
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
  const current = sessionInterview();

  // Reading a verdict costs an LLM call and returns someone's assessment, so
  // the caller has to be the room that ran it. Open, this answered anyone who
  // had the hostname.
  if (current && !ownsSession(req.query.code)) {
    return res.status(403).json({ error: 'that code does not match the interview in progress' });
  }

  const saved = profile();
  const customDuration = req.query.duration !== undefined ? Number(req.query.duration) : undefined;

  // `mock` is read off the interview, never off the request.
  //
  // It used to be `req.query.mock === '1'`, and the portal hides mocks — so a
  // candidate who did not like how their assessment went could append &mock=1
  // on the way out and the recruiter would never see the scorecard at all. The
  // company decides what is practice, at the point they schedule it.
  const mock = current ? current.mock : req.query.mock === '1';

  const scorecard = await buildScorecard(
    saved?.name ?? String(req.query.name ?? 'Candidate'),
    saved?.role ?? String(req.query.role || 'Senior Backend Engineer'),
    saved?.level ?? (req.query.level ? String(req.query.level) : undefined),
    customDuration,
    mock,
  );
  // Likewise the link to the recruiter: taken from the interview this session
  // was opened against, not from a query string anyone can write.
  await saveScorecardToHistory(scorecard, current ? current.code : null);
  broadcast({ type: 'scorecard', scorecard });
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
