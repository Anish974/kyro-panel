import { Router } from 'express';
import { AGENT_UID, credentials, mint } from '../panel/tokens.js';
import { sessionForChannel } from '../panel/model.js';

// Hands the browser what it needs to join the channel. Minting itself lives in
// panel/tokens.ts, so the App Certificate is read in exactly one place.
//
// This endpoint has no secret to check — the candidate's browser has no
// credentials before it joins. So it is bounded by what it will mint instead:
// a channel with a live interview behind it, and never the AI panel's uid.
// Without that, a deployed URL hands anyone a publisher token for any channel
// in the Agora project, and a token for uid 1001 lets them speak as the
// interviewer.
//
// The channel used to be a single configured one shared by everybody, so a
// token minted for one candidate worked for every other candidate's room too.
// Channels are per-interview now and a channel name is derived from the session
// id, which is 128 bits of randomness — knowing one tells you nothing about any
// other, and an interview that has ended stops minting entirely.

const router = Router();

export type Minted = ReturnType<typeof mint>;
export type Refusal = { code: number; error: string };

/**
 * The whole decision, separate from express so it stays checkable.
 * Returns either the minted tokens or the refusal to send.
 */
export function issueToken(channel: string, uidRaw: string): Minted | Refusal {
  const creds = credentials();
  if (!creds) {
    return { code: 500, error: 'AGORA_APP_ID / AGORA_APP_CERTIFICATE missing from .env' };
  }

  if (!channel) return { code: 400, error: 'channel is required' };

  // A channel is only real if an interview is running in it. This is what stops
  // the endpoint being a token vending machine for the whole Agora project, and
  // it is why a channel name nobody has been given cannot be guessed into.
  if (!sessionForChannel(channel)) return { code: 403, error: 'unknown channel' };

  if (!/^\d+$/.test(uidRaw)) return { code: 400, error: 'uid must be a number' };
  const uid = Number(uidRaw);

  // The panel's uid is minted server-side when the agent starts. Handing it out
  // here would let a caller publish audio as the interviewer.
  if (uid === AGENT_UID) return { code: 403, error: 'reserved uid' };
  if (uid === 0) return { code: 400, error: 'uid must not be 0' };

  return mint(creds, channel, uid);
}

router.get('/token', (req, res) => {
  const result = issueToken(String(req.query.channel ?? ''), String(req.query.uid ?? '0'));
  if ('error' in result) return res.status(result.code).json({ error: result.error });
  res.json(result);
});

export default router;
