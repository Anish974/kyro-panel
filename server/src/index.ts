import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { requireSecret } from './routes/auth.js';
import tokenRoutes from './routes/token.js';
import eventRoutes from './routes/events.js';
import llmRoutes from './routes/llm.js';

// Auto-load .env from repository root or current directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../.env'),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    try {
      if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(envPath);
      } else {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eq = trimmed.indexOf('=');
          if (eq > 0) {
            const key = trimmed.slice(0, eq).trim();
            const val = trimmed.slice(eq + 1).trim();
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      }
      break;
    } catch (err) {
      console.warn(`Could not load env file from ${envPath}:`, err);
    }
  }
}

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
