// Puts the AI panel into an Agora channel.
//
// Agora hosts the agent: it handles transport, speech-to-text, turn detection
// and text-to-speech. It calls our orchestrator for what to say.
//
// Run:  npm run agent-start          (start)
//       npm run agent-stop           (stop)
//       npm run agent-start -- --dry (print the request, send nothing)
//
// Docs: https://docs.agora.io/en/conversational-ai/rest-api/agent/join

const APP_ID = process.env.AGORA_APP_ID;
const CUSTOMER_ID = process.env.AGORA_CUSTOMER_ID;
const CUSTOMER_SECRET = process.env.AGORA_CUSTOMER_SECRET;
const CHANNEL = process.env.AGORA_CHANNEL || 'demo-channel';

// Agora runs in the cloud, so this MUST be a public URL — localhost will not
// work. Expose spike/orchestrator.js with a tunnel and put that URL here.
const ORCH_URL = process.env.ORCHESTRATOR_URL;

const TOKEN_SERVER = process.env.TOKEN_SERVER || 'http://localhost:8787';
const AGENT_UID = 1001;      // the agent's own uid in the channel
const CANDIDATE_UID = 1002;  // the human it listens to
const AGENT_NAME = process.env.AGENT_NAME || 'kyro-panel';

const BASE = 'https://api.agora.io/api/conversational-ai-agent/v2/projects';
const dry = process.argv.includes('--dry');
const stop = process.argv.includes('--stop');

function requireEnv(pairs) {
  const missing = pairs.filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error('Missing in .env: ' + missing.join(', '));
    console.error('Customer ID / Secret come from the Agora console, RESTful API section.');
    process.exit(1);
  }
}

const auth = () =>
  'Basic ' + Buffer.from(`${CUSTOMER_ID}:${CUSTOMER_SECRET}`).toString('base64');

async function getToken(uid) {
  const r = await fetch(`${TOKEN_SERVER}/token?channel=${encodeURIComponent(CHANNEL)}&uid=${uid}`);
  if (!r.ok) throw new Error(`token server ${r.status} — is it running? (npm run token-server)`);
  return (await r.json()).token;
}

async function start() {
  requireEnv([
    ['AGORA_APP_ID', APP_ID],
    ['AGORA_CUSTOMER_ID', CUSTOMER_ID],
    ['AGORA_CUSTOMER_SECRET', CUSTOMER_SECRET],
    ['ORCHESTRATOR_URL', ORCH_URL],
  ]);

  if (/localhost|127\.0\.0\.1/.test(ORCH_URL)) {
    console.error('ORCHESTRATOR_URL points at localhost. Agora cannot reach that.');
    console.error('Expose the orchestrator with a tunnel and use the public URL.');
    process.exit(1);
  }

  const token = await getToken(AGENT_UID);

  const body = {
    name: `${AGENT_NAME}-${Date.now()}`,
    properties: {
      channel: CHANNEL,
      token,
      agent_rtc_uid: String(AGENT_UID),
      remote_rtc_uids: [String(CANDIDATE_UID)],
      enable_string_uid: false,
      idle_timeout: 120,

      asr: {
        credential_mode: 'managed',
        vendor: 'deepgram',
        params: { url: 'wss://api.deepgram.com/v1/listen', model: 'nova-3', language: 'en-US' },
      },

      // Our orchestrator stands in for the LLM. It runs the panel bidding and
      // streams back whichever interviewer won the floor.
      llm: {
        url: `${ORCH_URL.replace(/\/$/, '')}/chat/completions`,
        api_key: process.env.ORCHESTRATOR_API_KEY || 'not-used-yet',
        system_messages: [{
          role: 'system',
          content: 'You are a panel of three interviewers. The orchestrator decides who speaks.',
        }],
        greeting_message: "Hi, I'm Arjun. Joining me are Ananya from product and Rohan from the hiring team. Shall we start?",
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
  console.log('  agent_id:', data.agent_id || '(see response)');
  console.log('  channel :', CHANNEL);
  console.log('');
  console.log(`Join as the candidate: uid ${CANDIDATE_UID} in "${CHANNEL}".`);
  console.log(`Save the agent_id — you need it to stop the agent.`);
}

async function stopAgent() {
  requireEnv([
    ['AGORA_APP_ID', APP_ID],
    ['AGORA_CUSTOMER_ID', CUSTOMER_ID],
    ['AGORA_CUSTOMER_SECRET', CUSTOMER_SECRET],
  ]);
  const agentId = process.env.AGENT_ID || process.argv[process.argv.indexOf('--stop') + 1];
  if (!agentId || agentId.startsWith('--')) {
    console.error('Need an agent id: npm run agent-stop -- --stop <agent_id>');
    process.exit(1);
  }
  const res = await fetch(`${BASE}/${APP_ID}/agents/${agentId}/leave`, {
    method: 'POST',
    headers: { authorization: auth() },
  });
  console.log(res.ok ? `agent ${agentId} stopped` : `stop failed ${res.status}: ${await res.text()}`);
}

(stop ? stopAgent() : start()).catch(err => {
  console.error(err.message);
  process.exit(1);
});
