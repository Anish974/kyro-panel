import { PANEL, panelistById, type CandidateProfile, type PanelistId } from '@kyro/shared';
import { AGENT_UID, CANDIDATE_UID, credentials, mint } from './tokens.js';
import { durationMin, profile } from './model.js';

/**
 * Who speaks the greeting. Arjun opens the interview, so the agent must start
 * in his voice — and routes/agent.ts captions the greeting under the same id.
 */
export const GREETER: PanelistId = 'technical';

// Puts the AI panel into an Agora channel, or takes it out.
//
// This used to live only in scripts/agent.ts, which meant every interview
// needed someone at a terminal. The logic is here so the server can do it too —
// the web app's Join button starts the panel, and no laptop is involved.
//
// https://docs.agora.io/en/ai/rest-api/join

const BASE = 'https://api.agora.io/api/conversational-ai-agent/v2/projects';

/**
 * How long Agora waits in silence before the agent leaves on its own.
 *
 * This is the backstop for a session nobody closed properly. It cannot go much
 * lower: a candidate thinking hard about a system-design question goes quiet
 * for thirty or forty seconds, and cutting the panel off mid-thought is worse
 * than the minute it saves.
 */
const IDLE_TIMEOUT = 90;

/**
 * How long past the booked end an agent may still be running.
 *
 * Conversational AI bills by the minute and the free tier is 300 of them, so an
 * agent left behind by a crashed tab, a blocked beacon or a dropped network
 * quietly eats a real interview's worth of quota. The browser stops the agent
 * on leave and on unload; this is what catches the times neither happens.
 *
 * The grace matters in both directions. Fixed at fifteen minutes it was wrong
 * either way once the length became a choice: a five-minute screen kept billing
 * for ten minutes after it ended, and a fifteen-minute interview was cut off by
 * its own reaper mid-conversation.
 */
const REAPER_GRACE_MS = 4 * 60 * 1000;

const maxSessionMs = (): number => durationMin() * 60_000 + REAPER_GRACE_MS;

let reaper: ReturnType<typeof setTimeout> | null = null;

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
/**
 * Roles are written for the eye — "Behavioural / HR" — and this line is read
 * aloud, where a slash comes out as "slash". Case is left alone on purpose:
 * lowercasing turns HR into "hr", which TTS says as a word rather than two
 * letters.
 */
const spoken = (role: string): string => role.replace(/\s*\/\s*/g, ' and ');

export function greeting(p: CandidateProfile | null): string {
  // Names come from PANEL, not from a string written here. The voice that
  // speaks this line already drifted from the name it claims once; a hardcoded
  // roster is the same bug waiting to happen the next time someone is renamed.
  const greeter = panelistById(GREETER);
  const others = PANEL.filter(x => x.id !== GREETER);
  const intro =
    `I'm ${greeter.name}, ${spoken(greeter.role)}. With me are ` +
    `${others.map(x => `${x.name}, ${spoken(x.role)}`).join(', and ')}.`;
  const ask =
    'Start by introducing yourself — who you are, and the piece of work you are ' +
    'proudest of. We will go from there.';

  if (!p) return `Hi, and welcome. ${intro} ${ask}`;

  const firstName = p.name.split(' ')[0];
  const resume = p.resumeText ? ' We have read your resume.' : '';
  // The level is deliberately not spoken. It reads "Intermediate (2-6 years)",
  // which TTS delivers as "open paren two to six years close paren", and the
  // candidate already knows their own experience. The panel still gets it —
  // bidding.ts puts it in every prompt, which is where it actually matters.
  return `Hi ${firstName}, thanks for making the time. ${intro} We are here for the ${p.role} role.${resume} ${ask}`;
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

      // How long the candidate may pause before Agora calls the answer finished.
      //
      // Left on the default this was far too eager. One real interview arrived
      // as six separate "finals" for a single answer, splitting on the commas:
      //
      //   "...I'm just I'm using MongoDB"
      //   "...unstructured data. Like telemetry,"
      //   "...logs,"
      //
      // Each of those is a turn posted to the orchestrator, and the panel is
      // then choosing between interrupting a sentence and saying nothing at all.
      // Neither is right, because the question was wrong: the candidate had not
      // finished. Widening the pause is what fixes it at the source.
      //
      // 1100ms is a breath, not a silence. Below about 800 a comma ends the
      // turn; much above 1200 and the panel starts to feel slow to answer.
      turn_detection: {
        mode: 'default',
        config: {
          end_of_speech: {
            mode: 'vad',
            vad_config: { silence_duration_ms: 1100 },
          },
        },
      },

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

      // The voice the agent starts with, which is the voice the GREETING is
      // spoken in — greeting_message never passes through /chat/completions, so
      // no per-turn override has been sent when it plays.
      //
      // It used to be Ananya's, while the greeting says "I'm Arjun Mehta,
      // technical architect". A female voice introduced itself as Arjun on
      // every single interview. Derived from PANEL now so it cannot drift from
      // whoever the greeting actually claims to be.
      tts: {
        credential_mode: 'managed',
        vendor: 'minimax',
        params: {
          url: 'wss://api.minimax.io/ws/v1/t2a_v2',
          model: 'speech-2.6-turbo',
          voice_setting: { voice_id: panelistById(GREETER).voice },
        },
      },

      // Filler words are disabled.
      //
      // In Agora Conversational AI + MiniMax T2A V2, filler words start TTS
      // synthesis in whatever voice was active in the PREVIOUS turn (or default).
      // Because MiniMax does not dynamically switch voice mid-stream, when the
      // new winner's metadata arrives, the entire question gets spoken in the
      // filler's voice (causing male interviewers to speak in female voices and
      // vice versa). Furthermore, sending voice_id metadata while a filler is
      // actively streaming causes Agora/MiniMax WebSocket resets and dropped
      // audio frames, making interviewers inaudible mid-interview.
      //
      // Disabling filler words ensures that the MiniMax TTS session is only
      // established AFTER the panel has decided the winner, so the winner's
      // exact voice ID is always used from the very first frame.
      filler_words: {
        enable: false,
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

  // Hard ceiling on a billable agent. unref() so a pending reaper never keeps
  // the process alive on its own.
  const cap = maxSessionMs();
  reaper = setTimeout(() => {
    console.warn(`[agent] ${current?.agentId} hit the ${cap / 60000}-minute cap — stopping it`);
    void stopAgent();
  }, cap);
  reaper.unref?.();

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
    if (!agentId || agentId === current?.agentId) {
      current = null;
      if (reaper) clearTimeout(reaper);
      reaper = null;
    }
  }
}
