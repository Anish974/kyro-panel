import { Router } from 'express';
// agora-token ships CommonJS — a named ESM import fails at runtime.
import agoraToken from 'agora-token';
const { RtcTokenBuilder, RtcRole, RtmTokenBuilder } = agoraToken;

// Mints Agora RTC and RTM tokens. The App Certificate lives here and only here —
// it must never reach the browser.
//
// Two tokens, one request. RTC carries the audio; RTM carries the live
// transcripts and the agent's state (thinking / speaking / listening), which
// the Conversational AI Engine publishes on the same channel name. An RTC token
// does not authenticate RTM — they are separate token types, and reusing one
// for the other fails at login with a misleading error.

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

  // The RTM user id must be the string form of the RTC uid — the engine
  // addresses transcript and presence events by publisher id, and the room
  // matches them against the uids it already knows.
  const rtmToken = RtmTokenBuilder.buildToken(appId, cert, uidRaw, expire);

  res.json({ appId, channel, uid: Number(uidRaw), token, rtmToken, expiresIn: TTL });
});

export default router;
