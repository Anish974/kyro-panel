// agora-token ships CommonJS — a named ESM import fails at runtime.
import agoraToken from 'agora-token';
const { RtcTokenBuilder, RtcRole, RtmTokenBuilder } = agoraToken;

// Token minting, in one place. The App Certificate is read here and nowhere
// else — it must never reach the browser, and it must not be copied into a
// second module that could drift from this one.
//
// Both /token (for the candidate's browser) and the agent starter (for the AI
// panel's own RTC session) come through here.

/** One hour. Long enough for an interview, short enough to be worth expiring. */
const TOKEN_TTL = 3600;

/** The AI panel's uid in the channel. Agora publishes its audio under this. */
export const AGENT_UID = 1001;

/** The candidate's uid. web/src/lib/agora.ts joins with the same number. */
export const CANDIDATE_UID = 1002;

export interface AgoraCredentials {
  appId: string;
  cert: string;
}

/**
 * Returns null rather than throwing when the project is not configured, so each
 * caller can answer in its own shape — a 500 for the route, a readable message
 * for the agent starter.
 */
export function credentials(): AgoraCredentials | null {
  const appId = process.env.AGORA_APP_ID;
  const cert = process.env.AGORA_APP_CERTIFICATE;
  return appId && cert ? { appId, cert } : null;
}

export interface MintedTokens {
  appId: string;
  channel: string;
  uid: number;
  /** RTC: carries the audio. */
  token: string;
  /** RTM: carries live transcripts and agent state. A different token type. */
  rtmToken: string;
  expiresIn: number;
}

export function mint(creds: AgoraCredentials, channel: string, uid: number): MintedTokens {
  const { appId, cert } = creds;
  const expire = Math.floor(Date.now() / 1000) + TOKEN_TTL;

  return {
    appId,
    channel,
    uid,
    token: RtcTokenBuilder.buildTokenWithUid(
      appId, cert, channel, uid, RtcRole.PUBLISHER, expire, expire,
    ),
    // The RTM user id must be the string form of the RTC uid — the engine
    // addresses transcript and presence events by publisher id, and the room
    // matches them against the uids it already knows.
    rtmToken: RtmTokenBuilder.buildToken(appId, cert, String(uid), expire),
    expiresIn: TOKEN_TTL,
  };
}
