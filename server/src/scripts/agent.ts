// Puts the AI panel into an Agora channel from a terminal.
//
//   npm run agent:start -w server           start
//   npm run agent:dry   -w server           print the request, send nothing
//   npm run agent:stop -w server -- <id>    stop
//
// The room's Join button does this by itself now (POST /agent/start), so this
// script is for debugging and for driving a server you are not sitting in front
// of. The logic lives in panel/agora-agent.ts — both paths share it, so a fix
// here is a fix there.
//
// Unlike the route, this process has no session of its own: the profile comes
// from the running server over /state, so sign in on the web app first.

import type { CandidateProfile } from '@kyro/shared';
import {
  AgentConfigError,
  buildJoinBody,
  channelName,
  startAgent,
  stopAgent,
} from '../panel/agora-agent.js';
import { AGENT_UID, CANDIDATE_UID, credentials, mint } from '../panel/tokens.js';
import { setProfile } from '../panel/model.js';

const SERVER = process.env.SERVER_URL ?? 'http://localhost:8787';
const ORCH_URL = process.env.ORCHESTRATOR_URL;

/**
 * Who signed in on the web app. This process holds no session, so it reads the
 * server's. Nobody signed in yet just means a generic greeting, never a failure.
 */
async function loadProfile(): Promise<CandidateProfile | null> {
  try {
    const r = await fetch(`${SERVER}/state`);
    if (!r.ok) return null;
    const { profile } = (await r.json()) as { profile: CandidateProfile | null };
    // Push it into this process's own model so agora-agent.ts builds the same
    // greeting it would build inside the server.
    if (profile) setProfile(profile);
    return profile;
  } catch {
    console.error(`Cannot reach the server at ${SERVER}.`);
    console.error('Start it first: npm run dev — or point SERVER_URL at the deployed one.');
    process.exit(1);
  }
}

function report(candidate: CandidateProfile | null): void {
  if (candidate) {
    console.log(`candidate  ${candidate.name} — ${candidate.role}`);
    console.log(`resume     ${candidate.resumeText ? `${candidate.resumeText.length} chars` : 'not attached'}`);
  } else {
    console.log('candidate  nobody has signed in yet — generic greeting');
    console.log('           sign in on the web app first and the panel opens by name');
  }
}

async function start(dry: boolean): Promise<void> {
  const candidate = await loadProfile();
  report(candidate);

  if (!ORCH_URL) {
    console.error('ORCHESTRATOR_URL is not set — Agora needs a public URL to call back.');
    process.exit(1);
  }

  if (dry) {
    const creds = credentials();
    if (!creds) {
      console.error('AGORA_APP_ID / AGORA_APP_CERTIFICATE missing from .env');
      process.exit(1);
    }
    const channel = channelName();
    console.log(JSON.stringify(buildJoinBody({
      channel,
      token: mint(creds, channel, AGENT_UID).token,
      orchestratorUrl: ORCH_URL,
      orchestratorKey: process.env.ORCHESTRATOR_API_KEY ?? '',
      candidate,
    }), null, 2));
    console.log('\n--dry: nothing sent.');
    return;
  }

  const agent = await startAgent(ORCH_URL);
  console.log('agent started');
  console.log('  agent_id:', agent.agentId);
  console.log('  channel :', agent.channel);
  console.log(`\nJoin as the candidate on uid ${CANDIDATE_UID} and start talking.`);
  console.log('Keep the agent_id — you need it to stop the agent.');
}

async function stop(agentId?: string): Promise<void> {
  if (!agentId) {
    console.error('Need an agent id: npm run agent:stop -w server -- <agent_id>');
    process.exit(1);
  }
  console.log((await stopAgent(agentId)).detail);
}

const [cmd, ...rest] = process.argv.slice(2);
const run = cmd === 'stop'
  ? stop(rest.find(a => !a.startsWith('--')))
  : start(rest.includes('--dry'));

run.catch((err: Error) => {
  // A configuration problem is the user's to fix and its message already says
  // how — no stack trace needed on top of it.
  console.error(err instanceof AgentConfigError ? err.message : err.stack ?? err.message);
  process.exit(1);
});
