// Puts the AI panel into an Agora channel, or takes it out.
//
//   npm run agent:start -w server           start
//   npm run agent:dry   -w server           print the request, send nothing
//   npm run agent:stop -w server -- <id>    stop
//
// https://docs.agora.io/en/conversational-ai/rest-api/agent/join

import type { CandidateProfile } from '@kyro/shared';

const BASE = 'https://api.agora.io/api/conversational-ai-agent/v2/projects';

const APP_ID = process.env.AGORA_APP_ID;
const CUSTOMER_ID = process.env.AGORA_CUSTOMER_ID;
const CUSTOMER_SECRET = process.env.AGORA_CUSTOMER_SECRET;
const CHANNEL = process.env.AGORA_CHANNEL ?? 'demo-channel';
const ORCH_URL = process.env.ORCHESTRATOR_URL;
const SERVER = process.env.SERVER_URL ?? 'http://localhost:8787';

const AGENT_UID = 1001;
const CANDIDATE_UID = 1002;

const auth = () => 'Basic ' + Buffer.from(`${CUSTOMER_ID}:${CUSTOMER_SECRET}`).toString('base64');

function need(pairs: [string, string | undefined][]): void {
  const missing = pairs.filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error('Missing in .env: ' + missing.join(', '));
    console.error('Customer ID / Secret: Agora console -> RESTful API.');
    process.exit(1);
  }
}

/**
 * Who logged in on the web app, if anyone has yet. The panel's greeting is
 * baked into the join request, so this has to be read here rather than at the
 * first turn — start the agent AFTER the candidate signs in and the panel opens
 * by name. Nobody signed in yet just means a generic greeting, never a failure.
 */
async function getProfile(): Promise<CandidateProfile | null> {
  try {
    const r = await fetch(`${SERVER}/state`);
    if (!r.ok) return null;
    return ((await r.json()) as { profile: CandidateProfile | null }).profile;
  } catch {
    return null;
  }
}

/**
 * The first thing the candidate hears. It introduces all three panelists by
 * name and hands the floor straight to the candidate — an interview opens with
 * "tell me about yourself", not with "shall we start?".
 */
function greeting(p: CandidateProfile | null): string {
  const intro =
    "I'm Arjun Mehta, technical architect. With me are Ananya Shah from product " +
    'and Rohan Iyer from the hiring team.';
  const ask =
    'Start by introducing yourself — who you are, and the piece of work you are ' +
    'proudest of. We will go from there.';

  if (!p) return `Hi, and welcome. ${intro} ${ask}`;

  const firstName = p.name.split(' ')[0];
  const resume = p.resumeText ? ' We have read your resume.' : '';
  return `Hi ${firstName}, thanks for making the time. ${intro} We are here for the ${p.role} role.${resume} ${ask}`;
}

async function getToken(uid: number): Promise<string> {
  // A dead server throws before we ever see a status, and bare "fetch failed"
  // tells you nothing. Say which URL and what to do about it.
  const r = await fetch(`${SERVER}/token?channel=${encodeURIComponent(CHANNEL)}&uid=${uid}`)
    .catch(() => {
      console.error(`Cannot reach the server at ${SERVER}.`);
      console.error('Start it first, in another terminal: npm run dev');
      process.exit(1);
    });
  if (!r.ok) throw new Error(`token endpoint ${r.status} — is the server running? (npm run dev)`);
  const data = (await r.json()) as { token: string };
  return data.token;
}

async function start(dry: boolean): Promise<void> {
  need([
    ['AGORA_APP_ID', APP_ID],
    ['AGORA_CUSTOMER_ID', CUSTOMER_ID],
    ['AGORA_CUSTOMER_SECRET', CUSTOMER_SECRET],
    ['ORCHESTRATOR_URL', ORCH_URL],
    // Agora sends this straight back to us as the Authorization header.
    // Without it every turn 401s, which looks like a broken agent, not a
    // missing key.
    ['ORCHESTRATOR_API_KEY', process.env.ORCHESTRATOR_API_KEY],
  ]);

  if (/localhost|127\.0\.0\.1/.test(ORCH_URL!)) {
    console.error('ORCHESTRATOR_URL points at localhost — Agora cannot reach that.');
    console.error('Run `npm run tunnel` and use the public URL it prints.');
    process.exit(1);
  }

  const candidate = await getProfile();
  if (candidate) {
    console.log(`candidate  ${candidate.name} — ${candidate.role}`);
    console.log(`resume     ${candidate.resumeText ? `${candidate.resumeText.length} chars` : 'not attached'}`);
  } else {
    console.log('candidate  nobody has signed in yet — generic greeting');
    console.log('           sign in on the web app first and the panel opens by name');
  }

  const body = {
    name: `kyro-panel-${Date.now()}`,
    properties: {
      channel: CHANNEL,
      token: await getToken(AGENT_UID),
      agent_rtc_uid: String(AGENT_UID),
      remote_rtc_uids: [String(CANDIDATE_UID)],
      enable_string_uid: false,
      idle_timeout: 120,

      asr: {
        credential_mode: 'managed',
        vendor: 'deepgram',
        params: { url: 'wss://api.deepgram.com/v1/listen', model: 'nova-3', language: 'en-US' },
      },

      // Our panel stands in for the LLM: it bids, picks a winner, and streams
      // that panelist's reply back with their voice set in the metadata chunk.
      llm: {
        url: `${ORCH_URL!.replace(/\/$/, '')}/chat/completions`,
        api_key: process.env.ORCHESTRATOR_API_KEY,
        system_messages: [
          { role: 'system', content: 'A three-person interview panel. The orchestrator decides who speaks.' },
        ],
        greeting_message: greeting(candidate),
        failure_message: 'Give me a second.',
        max_history: 20,
        params: { model: 'kyro-panel' },
      },

      tts: {
        credential_mode: 'managed',
        vendor: 'minimax',
        params: {
          url: 'wss://api.minimax.io/ws/v1/t2a_v2',
          model: 'speech-2.6-turbo',
          voice_setting: { voice_id: 'English_captivating_female1' },
        },
      },

      // The panel takes ~1350ms to decide who speaks and draft the reply
      // (docs/decisions.md). That is a real silence the candidate sits in.
      // Agora fills it from its own side, so the wait costs nothing extra and
      // the room stops sounding like it hung.
      //
      // Fires at 900ms, comfortably before the reply lands, so the filler is
      // already playing when it arrives rather than colliding with it.
      //
      // The filler is spoken in whatever TTS voice is currently set — the
      // PREVIOUS turn's winner, because we only name the next voice in the
      // metadata chunk we have not sent yet. In a three-person panel that reads
      // correctly: one interviewer murmurs while another takes the floor. Keep
      // the phrases neutral enough that any of the three could have said them.
      filler_words: {
        enable: true,
        trigger: {
          mode: 'fixed_time',
          fixed_time_config: { response_wait_ms: 900 },
        },
        content: {
          mode: 'static',
          static_config: {
            phrases: [
              'Mm-hmm.',
              'Right.',
              'Hmm, okay.',
              'Let me think about that for a second.',
              'Interesting.',
              'Give me a moment.',
            ],
            selection_rule: 'shuffle',
          },
        },
      },
    },

    // Turns on the Signaling side channel. The engine then publishes live
    // partial transcripts (both sides) as RTM channel messages, and its own
    // state — idle / listening / thinking / speaking / silent — as RTM presence
    // on the same channel. Both are things our SSE feed cannot know: it only
    // hears from us, and only once a whole turn is already over.
    //
    // These two sit BESIDE properties, not inside it.
    advanced_features: {
      enable_rtm: true,
    },
    parameters: {
      data_channel: 'rtm',
      enable_metrics: true,
      enable_error_message: true,
    },
  };

  if (dry) {
    console.log(JSON.stringify(body, null, 2));
    console.log('\n--dry: nothing sent.');
    return;
  }

  const res = await fetch(`${BASE}/${APP_ID}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: auth() },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`join failed ${res.status}: ${text}`);
    process.exit(1);
  }

  const data = JSON.parse(text);
  console.log('agent started');
  console.log('  agent_id:', data.agent_id ?? JSON.stringify(data));
  console.log('  channel :', CHANNEL);
  console.log(`\nJoin as the candidate on uid ${CANDIDATE_UID} and start talking.`);
  console.log('Keep the agent_id — you need it to stop the agent.');
}

async function stop(agentId?: string): Promise<void> {
  need([
    ['AGORA_APP_ID', APP_ID],
    ['AGORA_CUSTOMER_ID', CUSTOMER_ID],
    ['AGORA_CUSTOMER_SECRET', CUSTOMER_SECRET],
  ]);
  if (!agentId) {
    console.error('Need an agent id: npm run agent:stop -w server -- <agent_id>');
    process.exit(1);
  }
  const res = await fetch(`${BASE}/${APP_ID}/agents/${agentId}/leave`, {
    method: 'POST',
    headers: { authorization: auth() },
  });
  console.log(res.ok ? `agent ${agentId} stopped` : `stop failed ${res.status}: ${await res.text()}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const run = cmd === 'stop'
  ? stop(rest.find(a => !a.startsWith('--')))
  : start(rest.includes('--dry'));

run.catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
