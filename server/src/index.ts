import express from 'express';
import { requireSecret } from './routes/auth.js';
import tokenRoutes from './routes/token.js';
import eventRoutes from './routes/events.js';
import llmRoutes from './routes/llm.js';

const PORT = Number(process.env.PORT) || 8787;

const app = express();
app.use(express.json({ limit: '1mb' }));

// ponytail: wide-open CORS — the browser is on a different port in dev and the
// server holds no user data. Lock to the deployed web origin before shipping.
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// Everything that WRITES to the interview is behind the shared secret. Reads
// (/events, /state, /scorecard) stay open so the room UI needs no credentials.
app.use('/chat/completions', requireSecret);
app.use('/reset', requireSecret);
app.use(tokenRoutes);
app.use(eventRoutes);
app.use(llmRoutes);

app.listen(PORT, () => {
  console.log(`kyro server  http://localhost:${PORT}`);
  console.log(`  GET  /token?channel=&uid=   RTC token`);
  console.log(`  GET  /events                SSE -> room UI`);
  console.log(`  GET  /state                 shared candidate model`);
  console.log(`  POST /chat/completions      <- Agora calls this (needs the secret)`);
  console.log(`  POST /reset                 clear the session (needs the secret)`);
  console.log('');
  console.log('Agora runs in the cloud: expose this with `npm run tunnel` and');
  console.log('put the public URL in ORCHESTRATOR_URL before starting an agent.');
});
