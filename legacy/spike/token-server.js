// Mints Agora RTC tokens so we stop generating them by hand in the console.
// Run: npm run token-server   (needs .env with AGORA_APP_ID + AGORA_APP_CERTIFICATE)
//
// The App Certificate lives here and ONLY here. It must never reach the browser.

const http = require('node:http');
const { RtcTokenBuilder, RtcRole } = require('agora-token');

const APP_ID = process.env.AGORA_APP_ID;
const APP_CERT = process.env.AGORA_APP_CERTIFICATE;
const PORT = Number(process.env.TOKEN_PORT) || 8787;
const TTL = 3600; // seconds

if (!APP_ID || !APP_CERT) {
  console.error('Missing AGORA_APP_ID or AGORA_APP_CERTIFICATE.');
  console.error('Run via: npm run token-server  (it passes --env-file=.env)');
  process.exit(1);
}

// ponytail: no auth on this endpoint — anyone who can reach it mints tokens.
// Fine for localhost. Put it behind real auth before this is exposed anywhere.
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (url.pathname !== '/token') {
    res.writeHead(404).end('not found');
    return;
  }

  const channel = url.searchParams.get('channel');
  const uidRaw = url.searchParams.get('uid') ?? '0';

  if (!channel) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'channel is required' }));
    return;
  }
  if (!/^\d+$/.test(uidRaw)) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'uid must be a number' }));
    return;
  }

  const uid = Number(uidRaw);
  const expire = Math.floor(Date.now() / 1000) + TTL;

  const token = RtcTokenBuilder.buildTokenWithUid(
    APP_ID, APP_CERT, channel, uid, RtcRole.PUBLISHER, expire, expire
  );

  console.log(`token issued: channel=${channel} uid=${uid} ttl=${TTL}s`);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ appId: APP_ID, channel, uid, token, expiresIn: TTL }));
});

// --- self-check: `node --env-file=.env spike/token-server.js --check` ---
// Verifies token minting without binding a port.
if (process.argv.includes('--check')) {
  const exp = Math.floor(Date.now() / 1000) + TTL;
  const t = RtcTokenBuilder.buildTokenWithUid(
    APP_ID, APP_CERT, 'demo-channel', 1001, RtcRole.PUBLISHER, exp, exp
  );
  console.assert(typeof t === 'string' && t.startsWith('007'), 'token should start with 007');
  console.assert(t.length > 100, 'token looks too short');
  console.log('self-check passed, token prefix:', t.slice(0, 12));
  process.exit(0);
}

server.listen(PORT, () => {
  console.log(`token server on http://localhost:${PORT}`);
  console.log(`try: http://localhost:${PORT}/token?channel=demo-channel&uid=1001`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is busy. Run with a different one:`);
    console.error(`  TOKEN_PORT=8899 npm run token-server`);
    process.exit(1);
  }
  throw err;
});
