import { Router, type Request } from 'express';
import { AgentConfigError, GREETER, greeting, running, startAgent, stopAgent } from '../panel/agora-agent.js';
import { interview as sessionInterview, ownsSession, profile, resetSessionTimer } from '../panel/model.js';
import { broadcast } from './events.js';

// Lets the room start and stop the AI panel itself, so an interview needs a
// browser and nothing else. Before this, every session needed someone running
// `npm run agent:start` from a laptop.
//
// SECURITY. This endpoint spends money — each call creates an Agora agent that
// bills by the minute — and the browser has no shared secret to present, so it
// cannot sit behind requireSecret. Three things bound it:
//
//   1. The caller must present the invite code the session was opened against.
//      That code is the candidate's only credential, and it is checked against
//      what the server itself resolved, not against anything else in the body.
//   2. A candidate must have signed in. No profile, no agent.
//   3. One agent at a time, enforced in agora-agent.ts. A caller can start one,
//      not a thousand, and the second call gets a 409 until the first stops.
//
// Before the first of those, anyone holding the hostname could spend Agora
// minutes on demand.

const router = Router();

/**
 * Where Agora should call back for every turn.
 *
 * Derived from the request by default, so a fresh deployment works with no URL
 * to configure and nothing to keep in sync when the hostname changes. Render
 * terminates TLS at its proxy, so the forwarded headers are what carry the real
 * scheme and host. ORCHESTRATOR_URL still wins when set — a tunnel needs it,
 * because the request arrives with the tunnel's host but Agora must be told the
 * public one.
 */
function publicUrl(req: Request): string {
  const configured = process.env.ORCHESTRATOR_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  const proto = req.get('x-forwarded-proto')?.split(',')[0].trim() ?? req.protocol;
  const host = req.get('x-forwarded-host')?.split(',')[0].trim() ?? req.get('host') ?? '';
  return `${proto}://${host}`;
}

router.get('/agent/status', (_req, res) => {
  const agent = running();
  res.json(
    agent
      ? { running: true, ...agent, uptimeSec: Math.floor((Date.now() - agent.startedAt) / 1000) }
      : { running: false },
  );
});

router.post('/agent/start', async (req, res) => {
  const candidate = profile();
  if (!candidate) {
    return res.status(400).json({
      error: 'Sign in first — the panel greets the candidate by name, and that greeting is fixed when the agent joins.',
    });
  }

  // Only the room that opened this interview may put a billable agent in it.
  if (sessionInterview() && !ownsSession(presentedCode(req))) {
    return res.status(403).json({ error: 'that code does not match the interview in progress' });
  }

  const existing = running();
  if (existing) {
    return res.status(409).json({ error: 'An agent is already in the channel.', ...existing });
  }

  try {
    const agent = await startAgent(publicUrl(req));
    resetSessionTimer();

    // Agora speaks greeting_message straight from the join request — it never
    // reaches /chat/completions, so nothing in the room would otherwise know it
    // was said. The caption bar stayed empty through the whole introduction and
    // only filled in once the candidate spoke, which read as a broken room.
    //
    // Sent as a caption rather than a transcript turn: it is not scored, and
    // recording it would set lastSpeaker and quietly change who wins turn 1.
    broadcast({ type: 'speaking', panelist: GREETER, text: greeting(candidate) });

    console.log(`[agent] started ${agent.agentId} in ${agent.channel} for ${candidate.name} (clock reset to 0s)`);
    res.json({ running: true, ...agent });
  } catch (err) {
    // A misconfigured server is a 503: nothing the caller did is wrong, and
    // retrying will not help until an env var is set.
    const status = err instanceof AgentConfigError ? 503 : 502;
    console.warn(`[agent] start failed (${status}):`, (err as Error).message);
    res.status(status).json({ error: (err as Error).message });
  }
});

// Read from the query string as well as the body, because the one call that
// matters most cannot send a body at all: the browser stops the agent on
// unload through sendBeacon, and that is what keeps a closed tab from leaving
// a billable agent running until Agora's idle timeout collects it.
const presentedCode = (req: Request): unknown =>
  req.query.code ?? (req.body as { code?: unknown } | undefined)?.code;

router.post('/agent/stop', async (req, res) => {
  // Stopping is the safe direction — an unauthorised stop costs nothing and
  // saves money — but it still ends somebody's interview, so it takes the same
  // code as starting one.
  if (sessionInterview() && !ownsSession(presentedCode(req))) {
    return res.status(403).json({ error: 'that code does not match the interview in progress' });
  }

  try {
    const result = await stopAgent();
    console.log(`[agent] ${result.detail}`);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
