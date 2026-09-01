import type { NextFunction, Request, Response } from 'express';

// The tunnel is public. Anything that writes to the interview needs the shared
// secret Agora sends back to us — otherwise whoever guesses the hostname can
// inject turns into a live interview or wipe it mid-demo.
//
// Agora puts `llm.api_key` from the join request into the Authorization header,
// so this is the same value agent.ts sends.

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
  if (token !== SECRET) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  next();
}
