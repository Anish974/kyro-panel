import { Router, type Response } from 'express';
import type { SessionEvent } from '@kyro/shared';
import { getModel, reset } from '../panel/model.js';
import { buildScorecard } from '../panel/scorecard.js';

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

// Wipes the session so the next demo run starts from an empty model.
router.post('/reset', (_req, res) => {
  reset();
  broadcast({ type: 'state', model: getModel() });
  res.json({ ok: true });
});

// Ends the interview as far as the hiring team is concerned: build the three
// verdicts from the model as it stands and push them to anyone watching.
router.get('/scorecard', (req, res) => {
  const scorecard = buildScorecard(String(req.query.name ?? 'Candidate'));
  broadcast({ type: 'scorecard', scorecard });
  res.json(scorecard);
});

export default router;
