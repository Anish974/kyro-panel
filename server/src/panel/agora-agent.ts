import type { CandidateProfile } from '@kyro/shared';
import { AGENT_UID, CANDIDATE_UID, credentials, mint } from './tokens.js';
import { profile } from './model.js';

// Puts the AI panel into an Agora channel, or takes it out.
//
// This used to live only in scripts/agent.ts, which meant every interview
// needed someone at a terminal. The logic is here so the server can do it too —
// the web app's Join button starts the panel, and no laptop is involved.
//
// https://docs.agora.io/en/ai/rest-api/join

const BASE = 'https://api.agora.io/api/conversational-ai-agent/v2/projects';

/** How long Agora waits in silence before the agent leaves on its own. */
const IDLE_TIMEOUT = 120;

export interface RunningAgent {
  agentId: string;
  channel: string;
  startedAt: number;
}

// The server holds one interview in memory, so it can hold at most one agent.
// This is the real invariant, not a rate limit bolted on: a second agent in the
// same channel would talk over the first and write into the same session.
//
// It is also what keeps an open /agent/start from being a way to burn Agora
// minutes — a caller can start one agent, not a thousand.
//
// ponytail: in-memory, like the session. Both move together if this ever holds
// more than one interview.
let current: RunningAgent | null = null;

export const running = (): RunningAgent | null => current;

export const channelName = (): string => process.env.AGORA_CHANNEL ?? 'demo-channel';

const auth = (id: string, secret: string): string =>
  'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');

/**
 * The first thing the candidate hears. It introduces all three panelists by
 * name and hands the floor straight to the candidate — an interview opens with
 * "tell me about yourself", not with "shall we start?".
 *
 * Baked into the join request, so whoever starts the agent must do it AFTER the
 * candidate has signed in or the panel opens without their name.
 */
export function greeting(p: CandidateProfile | null): string {
  const intro =
    "I'm Arjun Mehta, technical architect. With me are Ananya Shah from product " +
    'and Rohan Iyer from the hiring team.';
  const ask =
    'Start by introducing yourself — who you are, and the piece of work you are ' +
    'proudest of. We will go from there.';

  if (!p) return `Hi, and welcome. ${intro} ${ask}`;

  const firstName = p.name.split(' ')[0];
  const resume = p.resumeText ? ' We have read your resume.' : '';
  const levelNotice = p.level ? ` (${p.level})` : '';
  return `Hi ${firstName}, thanks for making the time. ${intro} We are here for the ${p.role}${levelNotice} role.${resume} ${ask}`;
}

/** Thrown for every configuration problem so callers can report one shape. */
export class AgentConfigError extends Error {}

interface Config {
  appId: string;
  customerId: string;
  customerSecret: string;
  orchestratorKey: string;
}

function config(): Config {
  const appId = process.env.AGORA_APP_ID;
  const customerId = process.env.AGORA_CUSTOMER_ID;
  const customerSecret = process.env.AGORA_CUSTOMER_SECRET;
  // Agora sends this straight back to us as the Authorization header. Without
  // it every turn 401s, which looks like a broken agent rather than a missing
  // key — so it is checked here, before an agent is ever created.
  const orchestratorKey = process.env.ORCHESTRATOR_API_KEY;

  const missing = Object.entries({
    AGORA_APP_ID: appId,
    AGORA_CUSTOMER_ID: customerId,
    AGORA_CUSTOMER_SECRET: customerSecret,
    ORCHESTRATOR_API_KEY: orchestratorKey,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    throw new AgentConfigError(
      `Not configured: ${missing.join(', ')}. Customer ID and Secret come from ` +
      'the Agora console under RESTful API.',
    );
  }
  return { appId: appId!, customerId: customerId!, customerSecret: customerSecret!, orchestratorKey: orchestratorKey! };
}

/** The join request body. Exported so the CLI's --dry can print it. */
export function buildJoinBody(opts: {
  channel: string;
  token: string;
  orchestratorUrl: string;
  orchestratorKey: string;
  candidate: CandidateProfile | null;
}): Record<string, unknown> {
  const { channel, token, orchestratorUrl, orchestratorKey, candidate } = opts;

  return {
    name: `kyro-panel-${Date.now()}`,
    properties: {
      channel,
      token,
      agent_rtc_uid: String(AGENT_UID),
      remote_rtc_uids: ['*'],
      enable_string_uid: false,
      idle_timeout: IDLE_TIMEOUT,

      asr: {
        credential_mode: 'managed',
        vendor: 'deepgram',
        params: { url: 'wss://api.deepgram.com/v1/listen', model: 'nova-3', language: 'en-US' },
      },

      // Our panel stands in for the LLM: it bids, picks a winner, and streams
      // that panelist's reply back with their voice set in the metadata chunk.
      llm: {
        url: `${orchestratorUrl.replace(/\/$/, '')}/chat/completions`,
        api_key: orchestratorKey,
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
}

/**
 * Asks Agora to create the panel and put it in the channel.
 *
 * `orchestratorUrl` is where Agora will call back for every turn. It must be
 * publicly reachable — Agora runs in the cloud and cannot see localhost.
 */
export async function startAgent(orchestratorUrl: string): Promise<RunningAgent> {
  if (current) {
    throw new AgentConfigError(`An agent is already in ${current.channel} (${current.agentId}).`);
  }

  const { appId, customerId, customerSecret, orchestratorKey } = config();
  const creds = credentials();
  if (!creds) throw new AgentConfigError('AGORA_APP_CERTIFICATE is missing — cannot mint the agent token.');

  if (/localhost|127\.0\.0\.1/.test(orchestratorUrl)) {
    throw new AgentConfigError(
      `Agora cannot reach ${orchestratorUrl}. Deploy the server, or run \`npm run tunnel\` ` +
      'and put the public URL in ORCHESTRATOR_URL.',
    );
  }

  const channel = channelName();
  const body = buildJoinBody({
    channel,
    token: mint(creds, channel, AGENT_UID).token,
    orchestratorUrl,
    orchestratorKey,
    candidate: profile(),
  });

  const res = await fetch(`${BASE}/${appId}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: auth(customerId, customerSecret) },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Agora refused the join (${res.status}): ${text.slice(0, 300)}`);

  const data = JSON.parse(text) as { agent_id?: string };
  if (!data.agent_id) throw new Error(`Agora returned no agent_id: ${text.slice(0, 200)}`);

  current = { agentId: data.agent_id, channel, startedAt: Date.now() };
  return current;
}

/**
 * Takes the panel out of the channel. Defaults to the agent this process
 * started, so the room's Leave button needs no id.
 *
 * Clears the tracked agent even when Agora reports a failure: an agent we can
 * no longer address must not block the next start forever. Agora's own
 * idle_timeout collects anything genuinely left behind.
 */
export async function stopAgent(agentId?: string): Promise<{ stopped: boolean; detail: string }> {
  const id = agentId ?? current?.agentId;
  if (!id) return { stopped: false, detail: 'no agent is running' };

  const { appId, customerId, customerSecret } = config();
  try {
    const res = await fetch(`${BASE}/${appId}/agents/${id}/leave`, {
      method: 'POST',
      headers: { authorization: auth(customerId, customerSecret) },
    });
    const detail = res.ok ? `agent ${id} stopped` : `stop failed ${res.status}: ${(await res.text()).slice(0, 200)}`;
    return { stopped: res.ok, detail };
  } finally {
    if (!agentId || agentId === current?.agentId) current = null;
  }
}
