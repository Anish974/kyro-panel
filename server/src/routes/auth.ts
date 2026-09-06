import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { userIdFrom } from '../db/supabase.js';

// This server is reachable from the public internet — a cloudflared tunnel in
// dev, a permanent URL once deployed. Anything that writes to the interview
// needs the shared secret Agora sends back to us, or whoever has the hostname
// can inject turns into a live interview, burn the LLM quota, or wipe the
// session mid-demo. The deployed URL does not rotate, so this is the only
// thing protecting those two routes.
//
// Agora puts `llm.api_key` from the join request into the Authorization header,
// so this is the same value agent.ts sends.

/**
 * Constant-time comparison. Hashing both sides first means the compare always
 * runs over 32 bytes, so neither the secret's content nor its length leaks
 * through how long this took to say no.
 */
function matches(token: string, secret: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(token), digest(secret));
}

export function requireSecret(req: Request, res: Response, next: NextFunction): void {
  // Read per call, not at import: a module-level constant makes the missing-key
  // branch untestable and pins the value until the process restarts.
  const SECRET = process.env.ORCHESTRATOR_API_KEY ?? '';

  // No secret configured means a checkout that has not been set up yet. Refuse
  // rather than silently running open — a missing key must not read as "allow".
  if (!SECRET) {
    res.status(503).json({ error: 'ORCHESTRATOR_API_KEY is not set on the server' });
    return;
  }

  const header = req.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!matches(token, SECRET)) {
    // Never log either side of this. The deployed URL is public, so anyone can
    // trigger this line on demand — printing the expected secret would hand it
    // to whoever can read the log stream. Say what was wrong, not what was
    // expected.
    console.warn(
      `[auth] 401 ${req.method} ${req.path} | ` +
      (header ? `bad token (${token.length} chars)` : 'no authorization header'),
    );
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  next();
}

/**
 * A signed-in recruiter, or a 401.
 *
 * Everything a company can see is scoped to the account that scheduled it —
 * before this, one URL showed every candidate's name, resume and verdict to
 * anyone who found it, across every company using the deployment.
 *
 * The id lands on res.locals rather than the request, so a route reads it from
 * one place and cannot mistake a client-supplied field for a verified one.
 */
export async function requireRecruiter(req: Request, res: Response, next: NextFunction): Promise<void> {
  // No project configured means auth cannot be checked. Refuse rather than wave
  // everyone through — the same rule requireSecret follows for a missing key.
  if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_ANON_KEY?.trim()) {
    res.status(503).json({ error: 'sign-in is not configured on this server' });
    return;
  }

  const userId = await userIdFrom(req.get('authorization'));
  if (!userId) {
    res.status(401).json({ error: 'sign in to continue' });
    return;
  }

  res.locals.recruiterId = userId;
  next();
}

/** The verified recruiter on a request that got past requireRecruiter. */
export const recruiterId = (res: Response): string => String(res.locals.recruiterId);
