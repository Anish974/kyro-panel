import AgoraRTC, {
  type IAgoraRTCClient,
  type IMicrophoneAudioTrack,
  type ICameraVideoTrack,
} from 'agora-rtc-sdk-ng';
import { connectRtm, type RtmHandlers, type RtmSession } from './rtm.js';

// The candidate's side of the call. The AI panel is a separate participant
// that Agora's Conversational AI Engine puts into the same channel.

export const CANDIDATE_UID = 1002;

export interface JoinResult {
  client: IAgoraRTCClient;
  mic: IMicrophoneAudioTrack;
  camera: ICameraVideoTrack | null;
  /** Signaling side channel: live captions and agent state. Null if it failed. */
  rtm: RtmSession | null;
}

async function fetchToken(channel: string, uid: number) {
  const res = await fetch(`/token?channel=${encodeURIComponent(channel)}&uid=${uid}`);

  if (!res.ok) {
    // The server explains its own refusals — a 403 here means the channel has
    // no interview behind it, which is a very different problem from the server
    // being down. Guessing "is the server running?" at every status sent the
    // first person who hit a 403 looking in the wrong place entirely.
    const said = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(
      said?.error ??
        (res.status >= 500
          ? `the server could not issue a token (${res.status})`
          : `token request failed (${res.status})`),
    );
  }

  return res.json() as Promise<{ appId: string; token: string; rtmToken: string }>;
}

let activeClient: IAgoraRTCClient | null = null;
let activeMic: IMicrophoneAudioTrack | null = null;
let activeCamera: ICameraVideoTrack | null = null;

export async function joinAsCandidate(
  channel: string,
  onRemoteAudio?: (uid: string | number) => void,
  rtmHandlers?: RtmHandlers,
): Promise<JoinResult> {
  // Ensure any lingering client session is cleaned up first
  if (activeClient) {
    try {
      await activeClient.leave();
    } catch {}
    activeClient = null;
  }
  if (activeMic) {
    try {
      activeMic.stop();
      activeMic.close();
    } catch {}
    activeMic = null;
  }
  if (activeCamera) {
    try {
      activeCamera.stop();
      activeCamera.close();
    } catch {}
    activeCamera = null;
  }

  // Generate a distinct candidate UID per session to prevent Agora RTC UID_CONFLICT
  const candidateUid = Math.floor(10000 + Math.random() * 89999);

  console.log(`[agora] Fetching token for channel "${channel}" and uid ${candidateUid}...`);
  const { appId, token, rtmToken } = await fetchToken(channel, candidateUid);

  const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
  activeClient = client;

  try {
    client.on('user-published', async (user, mediaType) => {
      console.log(`[agora] Remote user published: UID ${user.uid}, mediaType: ${mediaType}`);
      await client.subscribe(user, mediaType);
      if (mediaType === 'audio') {
        console.log(`[agora] Playing remote audio track from UID ${user.uid}`);
        user.audioTrack?.play();
        onRemoteAudio?.(user.uid);
      }
    });

    client.on('user-joined', user => {
      console.log(`[agora] Remote user joined channel: UID ${user.uid}`);
    });

    await client.join(appId, channel, token, candidateUid);
    console.log(`[agora] Joined channel successfully as candidate UID ${candidateUid}`);

    try {
      const devices = await AgoraRTC.getMicrophones();
      console.log('[agora] Available microphones:', devices.map(d => `${d.label || 'Unknown'} (${d.deviceId})`));
    } catch (err) {
      console.warn('[agora] Could not list audio devices:', err);
    }

    const mic = await AgoraRTC.createMicrophoneAudioTrack({
      AEC: true,
      ANS: true,
      AGC: true,
    });
    activeMic = mic;
    console.log('[agora] Created microphone audio track on device:', mic.getTrackLabel());

    let camera: ICameraVideoTrack | null = null;
    try {
      camera = await AgoraRTC.createCameraVideoTrack();
      activeCamera = camera;
      console.log('[agora] Created camera video track');
    } catch (err) {
      console.warn('[agora] Camera not available or denied, continuing audio-only:', err);
      camera = null;
    }

    await client.publish(camera ? [mic, camera] : [mic]);
    console.log('[agora] Published candidate tracks to channel');

    // Signaling
    let rtm: RtmSession | null = null;
    if (rtmHandlers) {
      try {
        rtm = await connectRtm({ appId, channel, uid: candidateUid, rtmToken }, rtmHandlers);
      } catch (err) {
        console.warn('[rtm] connectRtm failed gracefully:', err);
      }
    }

    return { client, mic, camera, rtm };
  } catch (err) {
    console.warn('[agora] joinAsCandidate encountered an error, cleaning up:', err);
    try {
      if (activeMic) {
        activeMic.stop();
        activeMic.close();
        activeMic = null;
      }
      if (activeCamera) {
        activeCamera.stop();
        activeCamera.close();
        activeCamera = null;
      }
      await client.leave();
    } catch {}
    activeClient = null;
    throw err;
  }
}

export async function leave(session: JoinResult | null): Promise<void> {
  if (!session) return;
  activeClient = null;
  activeMic = null;
  activeCamera = null;
  await session.rtm?.close().catch(() => {});
  session.mic.stop();
  session.mic.close();
  session.camera?.stop();
  session.camera?.close();
  await session.client.leave().catch(() => {});
}
