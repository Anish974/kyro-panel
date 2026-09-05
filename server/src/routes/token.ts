import { Router } from 'express';
import { credentials, mint } from '../panel/tokens.js';

// Hands the browser what it needs to join the channel. Minting itself lives in
// panel/tokens.ts, so the App Certificate is read in exactly one place.
//
// ponytail: open endpoint — anyone with the URL can mint a publisher token for
// any channel in this Agora project. That was survivable behind a throwaway
// tunnel; on a permanent deployed URL it is worth restricting to the configured
// channel and the two known uids.

const router = Router();

router.get('/token', (req, res) => {
  const creds = credentials();
  if (!creds) {
    return res.status(500).json({ error: 'AGORA_APP_ID / AGORA_APP_CERTIFICATE missing from .env' });
  }

  const channel = String(req.query.channel ?? '');
  const uidRaw = String(req.query.uid ?? '0');
  if (!channel) return res.status(400).json({ error: 'channel is required' });
  if (!/^\d+$/.test(uidRaw)) return res.status(400).json({ error: 'uid must be a number' });

  res.json(mint(creds, channel, Number(uidRaw)));
});

export default router;
