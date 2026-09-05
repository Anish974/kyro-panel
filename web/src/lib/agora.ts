import AgoraRTC, {
  type IAgoraRTCClient,
  type IMicrophoneAudioTrack,
  type ICameraVideoTrack,
} from 'agora-rtc-sdk-ng';

// The candidate's side of the call. The AI panel is a separate participant
// that Agora's Conversational AI Engine puts into the same channel.

export const CANDIDATE_UID = 1002;

export interface JoinResult {
  client: IAgoraRTCClient;
  mic: IMicrophoneAudioTrack;
  camera: ICameraVideoTrack | null;
}

async function fetchToken(channel: string, uid: number) {
  const res = await fetch(`/token?channel=${encodeURIComponent(channel)}&uid=${uid}`);
  if (!res.ok) throw new Error(`token request failed (${res.status}) — is the server running?`);
  return res.json() as Promise<{ appId: string; token: string }>;
}

export async function joinAsCandidate(
  channel: string,
  onRemoteAudio?: (uid: string | number) => void,
): Promise<JoinResult> {
  console.log(`[agora] Fetching token for channel "${channel}" and uid ${CANDIDATE_UID}...`);
  const { appId, token } = await fetchToken(channel, CANDIDATE_UID);

  const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

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

  await client.join(appId, channel, token, CANDIDATE_UID);
  console.log(`[agora] Joined channel successfully as candidate UID ${CANDIDATE_UID}`);

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
  console.log('[agora] Created microphone audio track on device:', mic.getTrackLabel());

  let camera: ICameraVideoTrack | null = null;
  try {
    camera = await AgoraRTC.createCameraVideoTrack();
    console.log('[agora] Created camera video track');
  } catch (err) {
    console.warn('[agora] Camera not available or denied, continuing audio-only:', err);
    camera = null;
  }

  await client.publish(camera ? [mic, camera] : [mic]);
  console.log('[agora] Published candidate tracks to channel');

  return { client, mic, camera };
}

export async function leave(session: JoinResult | null): Promise<void> {
  if (!session) return;
  session.mic.stop();
  session.mic.close();
  session.camera?.stop();
  session.camera?.close();
  await session.client.leave();
}
