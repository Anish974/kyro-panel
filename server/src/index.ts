import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { requireSecret } from './routes/auth.js';
import tokenRoutes from './routes/token.js';
import eventRoutes from './routes/events.js';
import llmRoutes from './routes/llm.js';
import agentRoutes from './routes/agent.js';
import interviewRoutes from './routes/interviews.js';

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

// Health check endpoints for UptimeRobot, Render keep-alive, and monitoring
const handleHealthCheck: express.RequestHandler = (_req, res) => {
  res.status(200).json({
    status: 'ok',
    ok: true,
    service: 'kyro-panel',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
};

app.get('/health', handleHealthCheck);
app.get('/healthz', handleHealthCheck);
app.get('/ping', handleHealthCheck);

// Runtime client config endpoint (enables Supabase runtime credentials on Render)
app.get('/config', (_req, res) => {
  res.status(200).json({
    supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '',
  });
});

// Everything that WRITES to the interview is behind the shared secret. Reads
// (/events, /state, /scorecard) stay open so the room UI needs no credentials.
app.use('/chat/completions', requireSecret);
app.use('/reset', requireSecret);
app.use(tokenRoutes);
app.use(eventRoutes);
app.use(llmRoutes);
app.use(agentRoutes);
app.use(interviewRoutes);

// In production the built web app ships from this same origin, so every fetch
// in the browser stays a relative path: no CORS, no second host, and no build
// -time URL to keep in sync with wherever this ended up deployed. Absent in
// dev, where vite serves the app on :3000 and proxies these routes back here.
//
// Mounted last so a route above always wins — dist only holds index.html and
// assets/, but the ordering is the part that must not be re-arranged.
const webDist = path.resolve(__dirname, '../../web/dist');
const servingWeb = fs.existsSync(webDist);
if (servingWeb) app.use(express.static(webDist));

app.listen(PORT, () => {
  console.log(`kyro server  http://localhost:${PORT}`);
  console.log(`  GET  /health (or /ping)     health check & keep-alive`);
  console.log(`  GET  /token?channel=&uid=   RTC token`);
  console.log(`  GET  /events                SSE -> room UI`);
  console.log(`  GET  /state                 shared candidate model`);
  console.log(`  POST /candidate             name, role and resume from the login screen`);
  console.log(`  POST /chat/completions      <- Agora calls this (needs the secret)`);
  console.log(`  POST /reset                 clear the session (needs the secret)`);
  console.log(`  POST /agent/start|stop      put the AI panel in the channel, or take it out`);
  console.log(`  GET  /interviews            scheduled interviews (company portal)`);
  console.log(`  POST /interviews           schedule one, returns the invite code`);
  if (servingWeb) console.log(`  GET  /                      the built web app`);
  console.log('');
  if (servingWeb) {
    console.log('Web app and API share this origin — point ORCHESTRATOR_URL and');
    console.log('SERVER_URL at the public address of this server.');
  } else {
    console.log('Agora runs in the cloud: expose this with `npm run tunnel` and');
    console.log('put the public URL in ORCHESTRATOR_URL before starting an agent.');
  }
});
