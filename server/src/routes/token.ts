import { Router } from 'express';
// agora-token ships CommonJS — a named ESM import fails at runtime.
import agoraToken from 'agora-token';
const { RtcTokenBuilder, RtcRole } = agoraToken;

// Mints Agora RTC tokens. The App Certificate lives here and only here —
// it must never reach the browser.

const TTL = 3600;
const router = Router();

router.get('/token', (req, res) => {
  const appId = process.env.AGORA_APP_ID;
  const cert = process.env.AGORA_APP_CERTIFICATE;
  if (!appId || !cert) {
    return res.status(500).json({ error: 'AGORA_APP_ID / AGORA_APP_CERTIFICATE missing from .env' });
  }

  const channel = String(req.query.channel ?? '');
  const uidRaw = String(req.query.uid ?? '0');
  if (!channel) return res.status(400).json({ error: 'channel is required' });
  if (!/^\d+$/.test(uidRaw)) return res.status(400).json({ error: 'uid must be a number' });

  const expire = Math.floor(Date.now() / 1000) + TTL;
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId, cert, channel, Number(uidRaw), RtcRole.PUBLISHER, expire, expire,
  );

  res.json({ appId, channel, uid: Number(uidRaw), token, expiresIn: TTL });
});

export default router;
