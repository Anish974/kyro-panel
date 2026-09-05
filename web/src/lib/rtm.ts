import type { RTMEvents } from 'agora-rtm';
import { isAgentState, toTranscript, type AgentState, type LiveTranscript } from './transcript.js';

// The Conversational AI Engine's side channel.
//
// Our own SSE feed (/events) can only report what the SERVER knows, and the
// server only hears from Agora once a whole turn is over — so the room shows
// nothing while the candidate is mid-sentence, and nothing while the panel is
// thinking. Agora publishes both over Signaling:
//
//   RTM messages  -> live partial transcripts, candidate and panel
//   RTM presence  -> the agent's own state: idle/listening/thinking/speaking
//
// Enabled server-side by `advanced_features.enable_rtm` and
// `parameters.data_channel: "rtm"` in the agent join request (agent.ts).
//
// Message parsing lives in transcript.ts so the self-check can reach it without
// loading this browser-only SDK.

export type { AgentState, LiveTranscript };

export interface RtmHandlers {
  onTranscript?: (t: LiveTranscript) => void;
  onAgentState?: (state: AgentState) => void;
}

export interface RtmSession {
  close: () => Promise<void>;
}

/** Agora sends the payload as a string or as raw bytes, depending on size. */
function decode(raw: unknown): string | null {
  if (typeof raw === 'string') return raw;
  if (raw instanceof Uint8Array) return new TextDecoder('utf-8').decode(raw);
  return null;
}

/**
 * Logs in to Signaling and subscribes to the interview channel.
 *
 * Never throws into the caller's join path: RTM is an enhancement, and a
 * candidate whose Signaling login fails should still get the interview with
 * end-of-turn captions from SSE. Failures are logged and reported as null.
 */
export async function connectRtm(
  config: { appId: string; channel: string; uid: number; rtmToken: string },
  handlers: RtmHandlers,
): Promise<RtmSession | null> {
  const { appId, channel, uid, rtmToken } = config;
  if (!rtmToken) {
    console.warn('[rtm] no rtmToken from /token — live captions and agent state disabled');
    return null;
  }

  // Imported here rather than at the top: the Signaling SDK is ~1.4 MB and
  // nothing before the candidate presses Join needs it, so Vite keeps it out of
  // the login screen's bundle entirely.
  const { default: AgoraRTM } = await import('agora-rtm');

  // The RTM user id must match the RTC uid, as a string. Agora addresses
  // presence and messages by publisher id and the room matches on that.
  // The token goes to login(), not the constructor — RTMConfig has no token.
  const rtm = new AgoraRTM.RTM(appId, String(uid));

  // Listeners go on before login: they are global, and events published between
  // login and subscribe would otherwise be dropped.
  rtm.addEventListener('message', (event: RTMEvents.MessageEvent) => {
    const raw = decode(event.message);
    if (!raw) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const transcript = toTranscript(parsed);
    if (transcript) handlers.onTranscript?.(transcript);
  });

  rtm.addEventListener('presence', (event: RTMEvents.PresenceEvent) => {
    // stateChanged is a flat Record<string, string>. `state` is the one we
    // want, and only the agent ever publishes it.
    if (isAgentState(event.stateChanged?.state)) {
      handlers.onAgentState?.(event.stateChanged.state);
    }
  });

  try {
    await rtm.login({ token: rtmToken });
    await rtm.subscribe(channel, { withMessage: true, withPresence: true });
    console.log(`[rtm] subscribed to "${channel}" as ${uid} — live captions on`);
  } catch (err) {
    console.warn('[rtm] could not subscribe, falling back to end-of-turn captions:', err);
    try {
      await rtm.logout();
    } catch {
      // Already down; nothing to clean up.
    }
    return null;
  }

  return {
    close: async () => {
      try {
        await rtm.unsubscribe(channel);
        await rtm.logout();
      } catch (err) {
        console.warn('[rtm] teardown failed:', err);
      }
    },
  };
}
