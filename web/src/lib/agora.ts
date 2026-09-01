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
  const { appId, token } = await fetchToken(channel, CANDIDATE_UID);

  const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

  client.on('user-published', async (user, mediaType) => {
    await client.subscribe(user, mediaType);
    if (mediaType === 'audio') {
      user.audioTrack?.play();
      onRemoteAudio?.(user.uid);
    }
  });

  await client.join(appId, channel, token, CANDIDATE_UID);

  const mic = await AgoraRTC.createMicrophoneAudioTrack();
  // Camera is optional — the interview works without it, and a blocked camera
  // permission must not stop the candidate from joining.
  let camera: ICameraVideoTrack | null = null;
  try {
    camera = await AgoraRTC.createCameraVideoTrack();
  } catch {
    camera = null;
  }

  await client.publish(camera ? [mic, camera] : [mic]);
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
