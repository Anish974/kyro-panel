import { PANEL, panelistById, type CandidateProfile, type PanelistId } from '@kyro/shared';
import { AGENT_UID, credentials, mint } from './tokens.js';
import { AMBIENT_ID, findSession, inSession, profile, session, whenEvicted, type RunningAgent } from './model.js';

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
 * Nothing should hold an agent longer than this.
 *
 * The interview targets 10-12 minutes. Conversational AI bills by the minute
 * and the free tier is 300 of them, so one agent left running by a crashed tab,
 * a blocked beacon or a dropped network can quietly eat a real interview's
 * worth of quota. The browser stops the agent on leave and on unload; this is
 * what catches the times neither happens.
 */
const MAX_SESSION_MS = 15 * 60 * 1000;

/**
 * The billing cap's timers, keyed by session.
 *
 * They cannot live on the Session itself: a timer is a process-local handle,
 * and everything on the session is meant to be plain interview state.
 */
const reapers = new Map<string, ReturnType<typeof setTimeout>>();

export type { RunningAgent } from './model.js';

// One agent per session, not one per server.
//
// The invariant is unchanged in spirit — a second agent in the same channel
// would talk over the first and write into the same interview — but it is now
// scoped to the interview it protects, so two candidates can be in two rooms at
// once without either being able to disturb the other.
//
// It still bounds the spend: a caller holding one session id can start one
// agent, and the number of sessions is itself capped in model.ts.
export const running = (): RunningAgent | null => session().agent;

export const channelName = (): string => session().channel;

/**
 * A session that is swept for being idle must not leave a billable agent behind
 * in a channel nobody is listening to.
 */
whenEvicted(s => {
  const timer = reapers.get(s.id);
  if (timer) clearTimeout(timer);
  reapers.delete(s.id);
  if (s.agent) {
    console.warn(`[agent] session ${s.id} expired with ${s.agent.agentId} still running — stopping it`);
    void leave(s.agent.agentId);
  }
});

/** Agora's callback URL for one session. See the note at its call site. */
const prefixed = (base: string, sessionId: string): string => {
  const trimmed = base.replace(/\/$/, '');
  return sessionId === AMBIENT_ID ? trimmed : `${trimmed}/s/${sessionId}`;
};

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

      // Turn detection was left on Agora's defaults, which cost us 160ms of
      // dead air on every single turn: the engine waits out
      // `silence_duration_ms` of quiet before it decides the candidate has
      // finished and only then calls us. The default is 640.
      //
      // 480 is the floor worth taking. Below that a candidate who pauses to
      // pick a word gets cut off mid-sentence, and an interview is full of
      // those pauses. The other two numbers are Agora's own defaults, written
      // out so the next person tuning this can see the whole shape.
      //
      // `prefix_padding_ms` is lookback, not latency — it only decides how much
      // audio before the detected onset gets sent to ASR. 300 is enough to keep
      // a soft first syllable; 800 (the default) mostly ships room tone.
      turn_detection: {
        mode: 'default',
        config: {
          speech_threshold: 0.5,
          start_of_speech: {
            mode: 'vad',
            vad_config: { interrupt_duration_ms: 160, prefix_padding_ms: 300 },
          },
          end_of_speech: {
            mode: 'vad',
            vad_config: { silence_duration_ms: 480 },
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
        // Agora replays this many past turns into every /chat/completions call.
        // We read exactly one message out of that payload — the last user turn
        // — because the real transcript lives in model.ts. Twenty turns of
        // history was bytes on the wire and nothing else.
        max_history: 6,
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

      // The panel used to take ~1350ms to decide who speaks and draft the
      // reply, and this filled the silence the candidate sat in.
      //
      // The turn is two calls now — bids, then the winner's line streamed — so
      // the first words normally leave well before this fires. That is why the
      // trigger moved out from 900ms: at 900 it would land on top of a reply
      // that had already started, which is worse than the pause it covers. At
      // 1200 it only speaks for a turn that is genuinely running late, which is
      // exactly what it was for.
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
          fixed_time_config: { response_wait_ms: 1200 },
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
      // Turns on the Signaling side channel. The engine then publishes live
      // partial transcripts (both sides) as RTM channel messages, and its own
      // state — idle / listening / thinking / speaking / silent — as RTM
      // presence on the same channel. Both are things our SSE feed cannot know:
      // it only hears from us, and only once a whole turn is already over.
      advanced_features: {
        enable_rtm: true,
      },

      parameters: {
        data_channel: 'rtm',
        enable_metrics: true,
        enable_error_message: true,
        // Agora's low-latency RTC profile for a live two-way conversation. The
        // default profile buffers for smoothness, which is the right trade for
        // music and the wrong one for a room where one side is waiting to be
        // asked a question.
        audio_scenario: 'chorus',
      },
    },

    // These used to be sent BESIDE properties. The REST schema puts both INSIDE
    // it (docs.agora.io/en/conversational-ai/rest-api/join), and the copies
    // above are the ones that count. They are still sent at the top level too:
    // RTM transcripts demonstrably worked with them out here, and until an
    // interview has run on the corrected body this is not the thing to find out
    // the hard way. Delete this block once a session has proved it redundant.
    advanced_features: {
      enable_rtm: true,
    },
    parameters: {
      data_channel: 'rtm',
      enable_metrics: true,
      enable_error_message: true,
      audio_scenario: 'chorus',
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
  const s = session();
  if (s.agent) {
    throw new AgentConfigError(`An agent is already in ${s.agent.channel} (${s.agent.agentId}).`);
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

  const channel = s.channel;
  const body = buildJoinBody({
    channel,
    token: mint(creds, channel, AGENT_UID).token,
    // Agora calls back on a URL that names the session, so the turn it asks for
    // is scored against the interview it came from. This is the only thing that
    // ties a request arriving from Agora's cloud to one of the candidates in
    // memory — there is nothing else in the chat-completions body to key on.
    //
    // The ambient session is the exception and gets no prefix: its id is not a
    // secret, so the route refuses it, and an unprefixed callback lands on the
    // ambient interview anyway. That is the CLI's path, unchanged.
    orchestratorUrl: prefixed(orchestratorUrl, s.id),
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

  s.agent = { agentId: data.agent_id, channel, startedAt: Date.now() };

  // Hard ceiling on a billable agent. unref() so a pending reaper never keeps
  // the process alive on its own.
  //
  // The session is captured, not looked up when it fires: this callback runs
  // outside any request, so there is no async context for `session()` to read
  // and it would reap the ambient session instead of this one.
  const reaper = setTimeout(() => {
    console.warn(`[agent] ${s.agent?.agentId} hit the ${MAX_SESSION_MS / 60000}-minute cap — stopping it`);
    void stopAgentFor(s.id);
  }, MAX_SESSION_MS);
  reaper.unref?.();
  reapers.set(s.id, reaper);

  return s.agent;
}

/** The bare REST call. Used by the sweep, which has no session context left. */
async function leave(agentId: string): Promise<{ stopped: boolean; detail: string }> {
  const { appId, customerId, customerSecret } = config();
  const res = await fetch(`${BASE}/${appId}/agents/${agentId}/leave`, {
    method: 'POST',
    headers: { authorization: auth(customerId, customerSecret) },
  });
  return {
    stopped: res.ok,
    detail: res.ok
      ? `agent ${agentId} stopped`
      : `stop failed ${res.status}: ${(await res.text()).slice(0, 200)}`,
  };
}

/**
 * Takes this session's panel out of its channel.
 *
 * Clears the tracked agent even when Agora reports a failure: an agent we can
 * no longer address must not block the next start forever. Agora's own
 * idle_timeout collects anything genuinely left behind.
 */
export async function stopAgent(agentId?: string): Promise<{ stopped: boolean; detail: string }> {
  const s = session();
  const id = agentId ?? s.agent?.agentId;
  if (!id) return { stopped: false, detail: 'no agent is running' };

  try {
    return await leave(id);
  } finally {
    if (!agentId || agentId === s.agent?.agentId) {
      s.agent = null;
      const timer = reapers.get(s.id);
      if (timer) clearTimeout(timer);
      reapers.delete(s.id);
    }
  }
}

/**
 * The same, addressed by session id rather than by async context — for the
 * billing reaper, which fires long after the request that armed it is gone.
 */
export async function stopAgentFor(sessionId: string): Promise<{ stopped: boolean; detail: string }> {
  const s = findSession(sessionId);
  if (!s?.agent) return { stopped: false, detail: 'no agent is running' };
  return inSession(s, () => stopAgent());
}
