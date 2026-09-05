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

  try {
    // Imported dynamically so the Signaling SDK stays out of the initial bundle
    const { default: AgoraRTM } = await import('agora-rtm');

    // The RTM user id must match the RTC uid, as a string.
    const rtm = new AgoraRTM.RTM(appId, String(uid));

    // Listeners go on before login
    rtm.addEventListener('message', (event: RTMEvents.MessageEvent) => {
      const raw = decode(event.message);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const transcript = toTranscript(parsed);
        if (transcript) handlers.onTranscript?.(transcript);
      } catch {
        // ignore malformed message
      }
    });

    rtm.addEventListener('presence', (event: RTMEvents.PresenceEvent) => {
      if (isAgentState(event.stateChanged?.state)) {
        handlers.onAgentState?.(event.stateChanged.state);
      }
    });

    await rtm.login({ token: rtmToken });
    await rtm.subscribe(channel, { withMessage: true, withPresence: true });
    console.log(`[rtm] subscribed to "${channel}" as ${uid} — live captions on`);

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
  } catch (err) {
    console.warn('[rtm] could not connect to Signaling side channel, continuing without live captions:', err);
    return null;
  }
}
