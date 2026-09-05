import { Router, type Request } from 'express';
import { AgentConfigError, running, startAgent, stopAgent } from '../panel/agora-agent.js';
import { profile } from '../panel/model.js';

// Lets the room start and stop the AI panel itself, so an interview needs a
// browser and nothing else. Before this, every session needed someone running
// `npm run agent:start` from a laptop.
//
// SECURITY. This endpoint spends money — each call creates an Agora agent that
// bills by the minute — and the browser has no shared secret to present, so it
// cannot sit behind requireSecret. Two things bound it instead:
//
//   1. A candidate must have signed in. No profile, no agent.
//   2. One agent at a time, enforced in agora-agent.ts. A caller can start one,
//      not a thousand, and the second call gets a 409 until the first stops.
//
// That is a bound on the damage, not authentication. A public deployment that
// matters should put a real gate in front of this — a short-lived join code
// issued at sign-in is the smallest thing that would do it.

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

  const existing = running();
  if (existing) {
    return res.status(409).json({ error: 'An agent is already in the channel.', ...existing });
  }

  try {
    const agent = await startAgent(publicUrl(req));
    console.log(`[agent] started ${agent.agentId} in ${agent.channel} for ${candidate.name}`);
    res.json({ running: true, ...agent });
  } catch (err) {
    // A misconfigured server is a 503: nothing the caller did is wrong, and
    // retrying will not help until an env var is set.
    const status = err instanceof AgentConfigError ? 503 : 502;
    console.warn(`[agent] start failed (${status}):`, (err as Error).message);
    res.status(status).json({ error: (err as Error).message });
  }
});

router.post('/agent/stop', async (_req, res) => {
  try {
    const result = await stopAgent();
    console.log(`[agent] ${result.detail}`);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
