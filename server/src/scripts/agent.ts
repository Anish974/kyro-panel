// Puts the AI panel into an Agora channel, or takes it out.
//
//   npm run agent:start -w server           start
//   npm run agent:dry   -w server           print the request, send nothing
//   npm run agent:stop -w server -- <id>    stop
//
// https://docs.agora.io/en/conversational-ai/rest-api/agent/join

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
        greeting_message:
          "Hi, I'm Arjun. Joining me are Ananya from product and Rohan from the hiring team. Shall we start?",
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
