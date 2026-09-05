import { useEffect, useRef, useState } from 'react';
import { PANEL, panelistById, type PanelistId } from '@kyro/shared';
import { useSession } from '../lib/useSession.js';
import { joinAsCandidate, leave, type JoinResult } from '../lib/agora.js';
import type { AgentState } from '../lib/rtm.js';
import PanelistTile from '../components/PanelistTile.js';
import BidRail from '../components/BidRail.js';

const CHANNEL = 'demo-channel';

interface Props {
  candidateName: string;
  /** What the candidate is interviewing for, chosen on the login screen. */
  role: string;
  onEnd: () => void;
}

const AVATARS: Record<PanelistId, string> = {
  technical: '/assets/arjun_mehta.jpg',
  product: '/assets/ananya_shah.jpg',
  hr: '/assets/rohan_iyer.jpg',
};

/**
 * What the engine reports it is doing, in the room's own words. Null means say
 * nothing — idle and silent are not worth a line.
 *
 * `thinking` is the one that earns its place: the panel takes over a second to
 * decide who speaks next, and without this the room looks frozen for that
 * second. Agora's filler words cover it in audio; this covers it on screen.
 */
const AGENT_STATE_LABEL: Record<AgentState, string | null> = {
  thinking: 'Panel is deciding who asks next…',
  listening: 'Listening to you',
  speaking: 'Panel is speaking',
  idle: null,
  silent: null,
};

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function Room({ candidateName, role, onEnd }: Props) {
  const { model, bids, speaking: serverSpeaking, caption, heard, connected } = useSession();
  const [session, setSession] = useState<JoinResult | null>(null);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  // Live timer ticking up while interview session is connected
  useEffect(() => {
    if (!session) {
      setElapsedSec(0);
      return;
    }
    const timer = setInterval(() => {
      setElapsedSec(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [session]);

  // Local camera stream & permissions
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [cameraPermission, setCameraPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Interactive UI Controls
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);

  // Modals & Panels
  const [showContextDrawer, setShowContextDrawer] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showStageMenu, setShowStageMenu] = useState(false);
  const [currentStage, setCurrentStage] = useState('System Design');
  const [activeSpeakerId, setActiveSpeakerId] = useState<PanelistId>('technical');

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  // Distinct from joinError: the candidate is in the room, but the panel never
  // arrived. The join card is gone by then, so this needs its own place to show.
  const [panelError, setPanelError] = useState<string | null>(null);
  const [micVolume, setMicVolume] = useState<number>(0);
  const [prejoinMicVolume, setPrejoinMicVolume] = useState<number>(0);

  // Live from Agora Signaling, not from our own SSE feed. SSE only carries a
  // caption once the whole turn is over, because that is the first moment the
  // server knows anything. These update while the words are still being said.
  const [livePanel, setLivePanel] = useState<string | null>(null);
  const [liveCandidate, setLiveCandidate] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<AgentState>('idle');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const prejoinVideoRef = useRef<HTMLVideoElement | null>(null);
  const agoraVideoRef = useRef<HTMLDivElement>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const bindPrejoinVideo = (el: HTMLVideoElement | null) => {
    prejoinVideoRef.current = el;
    if (el && localStream) {
      if (el.srcObject !== localStream) {
        el.srcObject = localStream;
      }
      el.play().catch(() => {});
    }
  };

  const bindRoomVideo = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && localStream) {
      if (el.srcObject !== localStream) {
        el.srcObject = localStream;
      }
      el.play().catch(() => {});
    }
  };

  // Real-time audio analyser for pre-join mic check (Google Meet style)
  useEffect(() => {
    if (session || !localStream) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        void audioCtxRef.current.close().catch(() => {});
      }
      return;
    }

    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack || !micOn) {
      setPrejoinMicVolume(0);
      return;
    }

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      audioCtxRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.5;

      const sourceStream = new MediaStream([audioTrack]);
      const source = audioCtx.createMediaStreamSource(sourceStream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateVolume = () => {
        if (!audioCtx || audioCtx.state === 'closed') return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 110) * 100));
        setPrejoinMicVolume(normalized);
        animFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
    } catch (err) {
      console.warn('Pre-join audio analyser init failed:', err);
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        void audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [localStream, micOn, session]);

  // Monitor real-time mic volume from Agora track to detect if mic is silent/muted
  useEffect(() => {
    if (!session?.mic) {
      setMicVolume(0);
      return;
    }
    const interval = setInterval(() => {
      const vol = session.mic.getVolumeLevel();
      const pct = Math.round(vol * 100);
      setMicVolume(pct);
      if (pct > 5) {
        console.log(`[mic] Level: ${pct}%`);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [session]);

  // Sync server speaking state accurately: null when no one is speaking
  const currentSpeaker: PanelistId | null = serverSpeaking;
  const speakerInfo = currentSpeaker ? panelistById(currentSpeaker) : null;

  // Request browser camera & mic permissions for preview
  async function requestCameraAccess() {
    setPermissionError(null);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: true,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      }
      setLocalStream(stream);
      setCameraPermission('granted');
      setCameraOn(true);
      if (prejoinVideoRef.current) {
        prejoinVideoRef.current.srcObject = stream;
        prejoinVideoRef.current.play().catch(() => {});
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn('Media access denied or unavailable:', err);
      setCameraPermission('denied');
      setPermissionError('Camera or Microphone permission was denied. Please allow access in browser settings.');
    }
  }

  useEffect(() => {
    let mounted = true;
    async function initMedia() {
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
            audio: true,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        }
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        setLocalStream(stream);
        setCameraPermission('granted');
        if (prejoinVideoRef.current) {
          prejoinVideoRef.current.srcObject = stream;
          prejoinVideoRef.current.play().catch(() => {});
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        if (mounted) {
          setCameraPermission('denied');
          setPermissionError('Please allow camera and microphone access to enable device preview.');
        }
      }
    }
    void initMedia();
    return () => {
      mounted = false;
    };
  }, []);

  // Cleanup local stream on unmount
  useEffect(() => {
    return () => {
      localStream?.getTracks().forEach(t => t.stop());
    };
  }, [localStream]);

  // Bind local Agora camera stream or preview stream to containers
  useEffect(() => {
    if (session?.camera && agoraVideoRef.current) {
      session.camera.play(agoraVideoRef.current);
    }
    if (localStream) {
      if (videoRef.current && videoRef.current.srcObject !== localStream) {
        videoRef.current.srcObject = localStream;
        videoRef.current.play().catch(() => {});
      }
      if (prejoinVideoRef.current && prejoinVideoRef.current.srcObject !== localStream) {
        prejoinVideoRef.current.srcObject = localStream;
        prejoinVideoRef.current.play().catch(() => {});
      }
    }
  }, [session, localStream, cameraOn]);

  useEffect(() => () => { void leave(session); }, [session]);

  async function handleJoin() {
    setJoinError(null);
    setPanelError(null);
    setJoining(true);

    // Stop pre-join audio analyser & local audio tracks to release microphone cleanly for Agora
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      void audioCtxRef.current.close().catch(() => {});
    }
    localStream?.getAudioTracks().forEach(t => t.stop());

    try {
      // Ensure candidate role & profile are synced with server
      await fetch('/candidate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: candidateName, role }),
      }).catch(err => console.warn('Candidate sync warning:', err));

      const result = await joinAsCandidate(CHANNEL, undefined, {
        onTranscript: t => {
          if (t.speaker === 'candidate') setLiveCandidate(t.text);
          else setLivePanel(t.text);
        },
        onAgentState: setAgentState,
      });

      // Apply initial mic & camera states to Agora tracks
      if (!micOn && result.mic) {
        await result.mic.setEnabled(false);
      }
      if (!cameraOn && result.camera) {
        await result.camera.setEnabled(false);
      }

      setSession(result);

      // Start the panel agent
      const res = await fetch('/agent/start', { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setPanelError(body?.error ?? `The panel could not start (${res.status}).`);
      }
    } catch (err) {
      setJoinError((err as Error).message);
    } finally {
      setJoining(false);
    }
  }

  async function handleLeave() {
    try {
      await fetch('/agent/stop', { method: 'POST' });
    } catch {
      // Best effort
    }
    onEnd();
  }

  async function toggleMic() {
    const next = !micOn;
    if (session?.mic) {
      await session.mic.setEnabled(next);
      setMicOn(next);
    } else if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = next;
      });
      setMicOn(next);
    } else {
      setMicOn(next);
    }
  }

  async function toggleCamera() {
    const next = !cameraOn;
    if (session?.camera) {
      await session.camera.setEnabled(next);
      setCameraOn(next);
    } else if (localStream && localStream.getVideoTracks().length > 0) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = next;
      });
      setCameraOn(next);
      if (next) {
        if (prejoinVideoRef.current) {
          if (prejoinVideoRef.current.srcObject !== localStream) {
            prejoinVideoRef.current.srcObject = localStream;
          }
          prejoinVideoRef.current.play().catch(() => {});
        }
        if (videoRef.current) {
          if (videoRef.current.srcObject !== localStream) {
            videoRef.current.srcObject = localStream;
          }
          videoRef.current.play().catch(() => {});
        }
      }
    } else {
      await requestCameraAccess();
    }
  }

  const panelSpeakerName =
    PANEL.find(p => p.id === caption?.speaker)?.name ?? 'Panel';

  const panelLine = livePanel ?? caption?.text ?? null;
  const candidateLine = liveCandidate ?? heard ?? null;
  const agentStateLabel = AGENT_STATE_LABEL[agentState];

  return (
    <div className="h-full flex flex-col bg-[#FAF9F6] text-gray-900 select-none overflow-hidden font-sans relative">
      {/* ---------------------------------------------------- GOOGLE MEET PRE-JOIN GREENROOM MODAL */}
      {!session && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10 bg-slate-950/75 backdrop-blur-2xl animate-in fade-in duration-300 overflow-y-auto">
          <div className="w-full max-w-5xl bg-white rounded-3xl border border-[#EBE6DF] shadow-2xl overflow-hidden flex flex-col lg:flex-row my-auto">
            {/* Left: Video Preview & Device Controls */}
            <div className="flex-1 bg-[#11141C] p-6 sm:p-8 flex flex-col justify-between relative min-h-[340px] sm:min-h-[420px]">
              {/* Video container */}
              <div className="absolute inset-0 z-0 overflow-hidden bg-[#0D1017]">
                <video
                  ref={bindPrejoinVideo}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transform -scale-x-100 ${
                    cameraOn && cameraPermission === 'granted' ? 'block' : 'hidden'
                  }`}
                />
                {(!cameraOn || cameraPermission !== 'granted') && (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#181D28] to-[#0D1017] text-white p-6">
                    <div className="w-24 h-24 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shadow-xl">
                      <span className="font-display text-3xl font-extrabold text-blue-400">
                        {candidateName.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div className="text-center">
                      <h4 className="text-base font-bold text-white">
                        {!cameraOn ? 'Camera is turned off' : 'Camera preview unavailable'}
                      </h4>
                      <p className="text-xs text-gray-400 mt-1 max-w-xs">
                        {!cameraOn
                          ? 'Click the camera button below to turn your video on.'
                          : permissionError || 'Please allow camera and mic permissions in browser.'}
                      </p>
                    </div>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 pointer-events-none" />
              </div>

              {/* Top overlay badge */}
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20 text-white text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Device Check</span>
                </div>
                <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 text-gray-300 text-xs font-mono">
                  Kyro Greenroom
                </div>
              </div>

              {/* Bottom overlay: Live Mic Equalizer & Controls */}
              <div className="relative z-10 flex flex-col gap-4 mt-auto">
                {/* Floating Equalizer / Audio Waveform Meter */}
                <div className="self-center bg-black/65 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/20 flex items-center gap-3 shadow-lg">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                    <svg className={`w-4 h-4 ${micOn && prejoinMicVolume > 0 ? 'text-emerald-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    <span>{micOn ? (prejoinMicVolume > 0 ? 'Speaking...' : 'Microphone Ready') : 'Mic Muted'}</span>
                  </div>

                  {/* 7-bar dynamic audio visualizer */}
                  <div className="flex items-center gap-[3px] h-4">
                    {[1, 2, 3, 4, 5, 6, 7].map(i => {
                      const factor = 1 + ((i * 2) % 4) * 0.3;
                      const barHeight = micOn && prejoinMicVolume > 0
                        ? Math.min(16, Math.max(3, Math.round((prejoinMicVolume / 100) * 16 * factor)))
                        : 3;
                      return (
                        <span
                          key={i}
                          className={`w-[3px] rounded-full transition-all duration-75 ${
                            micOn && prejoinMicVolume > 0 ? 'bg-emerald-400' : 'bg-gray-500'
                          }`}
                          style={{ height: `${barHeight}px` }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Google Meet style round control toggles */}
                <div className="flex items-center justify-center gap-4">
                  {/* Mic Toggle Button */}
                  <button
                    onClick={toggleMic}
                    title={micOn ? 'Turn off microphone' : 'Turn on microphone'}
                    className={`w-13 h-13 rounded-full flex items-center justify-center transition-all shadow-xl active:scale-95 cursor-pointer ${
                      micOn
                        ? 'bg-white/95 hover:bg-white text-gray-900 ring-2 ring-white/40'
                        : 'bg-red-500 hover:bg-red-600 text-white ring-2 ring-red-400/50'
                    }`}
                  >
                    {micOn ? (
                      <svg className="w-6 h-6 text-[#2563EB]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>

                  {/* Camera Toggle Button */}
                  <button
                    onClick={toggleCamera}
                    title={cameraOn ? 'Turn off camera' : 'Turn on camera'}
                    className={`w-13 h-13 rounded-full flex items-center justify-center transition-all shadow-xl active:scale-95 cursor-pointer ${
                      cameraOn
                        ? 'bg-white/95 hover:bg-white text-gray-900 ring-2 ring-white/40'
                        : 'bg-red-500 hover:bg-red-600 text-white ring-2 ring-red-400/50'
                    }`}
                  >
                    {cameraOn ? (
                      <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Join Info Card */}
            <div className="w-full lg:w-[420px] p-8 sm:p-10 flex flex-col justify-between bg-white">
              <div className="flex flex-col gap-6">
                {/* Brand Tag */}
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-xs font-bold text-[#2563EB]">
                    <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-pulse" />
                    EchoSphere AI Panel
                  </div>
                  <span className="text-xs font-semibold text-gray-500">Live Voice Session</span>
                </div>

                {/* Heading & Target Role */}
                <div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-950 font-display tracking-tight">
                    Ready to join?
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">
                    Connect live to begin your interview evaluation.
                  </p>

                  {/* Highlighted Candidate & Target Role card */}
                  <div className="mt-4 p-4 rounded-2xl bg-[#FAF9F6] border border-[#EBE6DF] flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono uppercase text-gray-500 font-bold">Candidate</span>
                      <span className="text-sm font-bold text-gray-900">{candidateName}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-[#EBE6DF]">
                      <span className="text-xs font-mono uppercase text-gray-500 font-bold">Target Role</span>
                      <span className="text-xs font-bold text-[#2563EB] bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                        {role}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Interviewers in the room */}
                <div className="flex flex-col gap-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500 font-mono">
                    3 AI Interviewers in Room
                  </span>
                  <div className="flex flex-col gap-2">
                    {PANEL.map(p => (
                      <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl bg-gray-50 border border-gray-100">
                        <img src={AVATARS[p.id]} alt={p.name} className="w-8 h-8 rounded-full object-cover border border-gray-200" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">{p.name}</p>
                          <p className="text-[11px] text-gray-500 truncate">{p.role}</p>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Button & Errors */}
              <div className="mt-8 flex flex-col gap-3">
                {joinError && (
                  <div className="p-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>{joinError}</span>
                  </div>
                )}

                <button
                  onClick={handleJoin}
                  disabled={joining}
                  className="w-full py-4 px-6 rounded-2xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-sm sm:text-base shadow-xl hover:shadow-blue-500/25 transition-all flex items-center justify-center gap-3 cursor-pointer active:scale-98 disabled:opacity-50 disabled:cursor-wait"
                >
                  {joining ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Connecting to Panel...</span>
                    </>
                  ) : (
                    <>
                      <span>Join AI Panel</span>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </>
                  )}
                </button>

                <p className="text-[11px] text-center text-gray-500">
                  Microphone will connect live upon joining. Speak naturally.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- TOP HEADER BAR */}
      <header className="h-[72px] shrink-0 bg-white border-b border-[#EBE6DF] px-8 flex items-center justify-between z-20 shadow-xs">
        {/* Left: Brand, AI Panel Badge, Candidate Name & Target Role */}
        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-2.5 text-[#2563EB]">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center shadow-2xs">
              <svg className="w-6 h-6 text-[#2563EB]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.122H1.5v-.125zM14.25 19.25a5.625 5.625 0 00-1.875-4.148 7.87 7.87 0 014.875-1.727 6.375 6.375 0 016.375 6.375v.125h-9.375v-.625z" />
              </svg>
            </div>
            <span className="font-display font-extrabold text-lg md:text-xl tracking-tight text-gray-900">
              Kyro Panel
            </span>
          </div>

          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] shadow-2xs">
            AI Panel
          </span>

          <span className="w-px h-6 bg-[#EBE6DF]" />

          {/* Candidate Name & Role (Always visible) */}
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold text-gray-900">{candidateName}</span>
            <span className="text-xs font-semibold text-[#2563EB] bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60 inline-flex items-center gap-1 w-fit mt-0.5">
              <span>🎯</span>
              <span>{role}</span>
            </span>
          </div>
        </div>

        {/* Center: Target Role Track & Stage Stepper */}
        <div className="flex flex-col items-center justify-center gap-1.5">
          <div className="relative">
            <button
              onClick={() => setShowStageMenu(!showStageMenu)}
              className="flex items-center gap-2 text-sm sm:text-base font-bold text-gray-800 hover:text-gray-950 px-3 py-1 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <span className="text-[#2563EB]">{role}:</span>
              <span>{currentStage}</span>
              <svg className="w-4 h-4 text-gray-500 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showStageMenu && (
              <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-64 bg-white border border-[#EBE6DF] rounded-2xl shadow-xl py-2 z-30 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 py-1.5 border-b border-gray-100 text-[11px] font-mono uppercase text-gray-400 font-bold">
                  {role} Evaluation Track
                </div>
                {['System Design', 'Architecture Deep Dive', 'Trade-off Analysis', 'HR & Alignment'].map(stage => (
                  <button
                    key={stage}
                    onClick={() => {
                      setCurrentStage(stage);
                      setShowStageMenu(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer ${
                      currentStage === stage ? 'text-[#2563EB] bg-blue-50/70 font-bold' : 'text-gray-700'
                    }`}
                  >
                    <span>{stage}</span>
                    {currentStage === stage && <span className="w-2 h-2 rounded-full bg-[#2563EB]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 4-Step Stepper Line */}
          <div className="flex items-center gap-2">
            <div className="flex items-center">
              <span className="w-3 h-3 rounded-full bg-[#2563EB] ring-4 ring-blue-100" />
              <span className="w-12 h-0.5 bg-[#2563EB]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#E6DAC8]" />
              <span className="w-12 h-0.5 bg-[#E6DAC8]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#E6DAC8]" />
              <span className="w-12 h-0.5 bg-[#E6DAC8]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#E6DAC8]" />
            </div>
          </div>
        </div>

        {/* Right: Connection, Timer, Leave Interview, Security Shield */}
        <div className="flex items-center gap-6">
          {/* Connection status */}
          <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
            <div className="flex items-end gap-[2px] h-4">
              <span className="w-1 h-2 bg-emerald-500 rounded-xs" />
              <span className="w-1 h-3 bg-emerald-500 rounded-xs" />
              <span className="w-1 h-4 bg-emerald-500 rounded-xs" />
            </div>
            <span className="text-sm font-bold text-emerald-600">
              Good Connection
            </span>
          </div>

          {/* Interview Time Clock */}
          <div className="flex items-center gap-2.5 border-l border-[#EBE6DF] pl-5">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-mono font-black text-sm md:text-base text-[#111827] tracking-tight leading-none">
                {formatTimer(session ? elapsedSec : (model.elapsed || 0))}
              </span>
              <span className="text-[11px] text-[#4B5565] font-semibold leading-none mt-1">
                {model.turns > 0 ? `Turn ${model.turns} / ~10` : '10-12 min max'}
              </span>
            </div>
          </div>

          {/* Leave Interview Button */}
          <button
            onClick={() => void handleLeave()}
            className="border border-[#EBE6DF] hover:border-gray-400 text-gray-800 hover:text-gray-950 bg-white hover:bg-gray-50 text-xs md:text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-2xs cursor-pointer"
          >
            Leave Interview
          </button>

          {/* Security Shield Icon */}
          <div className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------- MAIN BODY GRID */}
      <div className="flex-1 flex px-8 py-5 gap-6 min-h-0 bg-[#FAF9F6]">
        {/* LEFT / CENTER: Candidate Stage Area */}
        <main className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Active Speaker Notification Bar */}
          <div className="flex items-center gap-2.5 px-1 text-sm font-semibold text-gray-800 shrink-0">
            <div className="flex items-center justify-center text-[#2563EB]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.111 16.404a5.5 5.5 0 010-7.778M12 12h.01m3.878-4.404a5.5 5.5 0 010 7.778M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728" />
              </svg>
            </div>
            <span>Active Speaker:</span>
            {panelError ? (
              <span className="font-semibold text-sm text-red-600 flex items-center gap-1.5">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {panelError}
              </span>
            ) : speakerInfo ? (
              <>
                <span className="font-extrabold text-gray-950 text-base">{speakerInfo.name}</span>
                <span className="text-gray-500 font-medium">({speakerInfo.role})</span>
              </>
            ) : agentStateLabel ? (
              <span
                className={`font-semibold text-sm flex items-center gap-1.5 ${
                  agentState === 'thinking' ? 'text-amber-600' : 'text-emerald-600'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    agentState === 'thinking' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                  }`}
                />
                {agentStateLabel}
              </span>
            ) : (
              <span className="font-medium text-gray-500 text-sm">None (Panel listening to candidate)</span>
            )}
          </div>

          {/* Large Candidate Video Container */}
          <div className="flex-1 min-h-0 rounded-3xl border border-[#EBE6DF] relative overflow-hidden bg-gradient-to-b from-[#161A22] to-[#0D1016] shadow-sm flex flex-col justify-between p-6">
            {/* Live Camera Video Feed */}
            <video
              ref={bindRoomVideo}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 z-0 ${
                cameraOn && cameraPermission === 'granted' && !session?.camera ? 'block' : 'hidden'
              }`}
            />

            {/* Agora Video container if joined via Agora */}
            <div
              ref={agoraVideoRef}
              className={`absolute inset-0 z-0 [&>video]:w-full [&>video]:h-full [&>video]:object-cover ${
                cameraOn && session?.camera ? 'block' : 'hidden'
              }`}
            />

            {/* Camera Permission / Camera Off Fallback */}
            {(!cameraOn || cameraPermission !== 'granted') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#181D26] to-[#0F1218] text-white p-6 z-0">
                <div className="w-24 h-24 rounded-3xl bg-white/10 border border-white/15 flex flex-col items-center justify-center shadow-xl backdrop-blur-md">
                  <span className="font-display text-3xl font-extrabold tracking-wider text-white/90">
                    {candidateName.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>

                <div className="text-center max-w-sm">
                  <h4 className="text-base font-bold text-white">
                    {!cameraOn ? 'Camera is turned off' : 'Camera Access Needed'}
                  </h4>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    {!cameraOn
                      ? 'Click the Camera button below to turn your video on.'
                      : permissionError || 'Please allow camera and microphone access to enable your live video feed.'}
                  </p>
                </div>

                {cameraPermission !== 'granted' && (
                  <button
                    onClick={requestCameraAccess}
                    className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-600 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Allow Camera Access</span>
                  </button>
                )}
              </div>
            )}

            {/* Subtle overlay shading for high contrast badges */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/30 pointer-events-none z-1" />

            {/* Top Left: Candidate Badge */}
            <div className="relative z-10 self-start">
              <div className="flex items-center gap-2.5 bg-black/50 backdrop-blur-md border border-white/25 rounded-xl px-4 py-2 text-white shadow-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm font-bold tracking-tight">You (Candidate)</span>
              </div>
            </div>

            {/* Bottom Floating Elements: Mic Status & Closed Captions */}
            <div className="relative z-10 flex items-end justify-between gap-5 mt-auto">
              {/* Bottom Left: Mic On / Live Sound Wave Card */}
              <div className="bg-white/95 backdrop-blur-md rounded-2xl p-3.5 shadow-lg border border-white/50 flex items-center gap-3">
                <div className="flex flex-col gap-1.5 min-w-[130px]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <svg className={`w-4 h-4 ${micOn ? 'text-emerald-600' : 'text-red-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      <span className="text-xs font-extrabold text-gray-900">
                        {micOn ? (session ? `Mic (${micVolume}%)` : 'Mic Ready') : 'Mic Muted'}
                      </span>
                    </div>
                    {session && micOn && micVolume > 0 && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    )}
                  </div>

                  {/* Dynamic audio equalizer reflecting actual input volume */}
                  <div className="flex items-center gap-[3px] h-4 px-0.5">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => {
                      const baseHeight = 3;
                      const factor = 1 + ((i * 3) % 5) * 0.25;
                      const activeHeight = micOn && micVolume > 0
                        ? Math.min(16, Math.max(3, Math.round((micVolume / 100) * 16 * factor)))
                        : baseHeight;
                      return (
                        <span
                          key={i}
                          className={`w-[3px] rounded-full transition-all duration-100 ${
                            micVolume > 0 && micOn ? 'bg-[#2563EB]' : 'bg-gray-300'
                          }`}
                          style={{ height: `${activeHeight}px` }}
                        />
                      );
                    })}
                  </div>

                  {/* Warning if mic is on but volume is 0 */}
                  {session && micOn && micVolume === 0 && (
                    <span className="text-[10px] text-amber-600 font-bold leading-tight">
                      ⚠️ Low volume. Speak louder or check mic settings.
                    </span>
                  )}
                </div>
              </div>

              {/* Bottom Center: Subtitles / Captions Box */}
              {captionsOn && (
                <div className="flex-1 max-w-2xl mx-auto bg-black/85 backdrop-blur-md text-white rounded-2xl px-6 py-3.5 border border-white/15 shadow-xl flex items-start gap-3.5">
                  <div className="w-7 h-6 rounded-md bg-white/20 text-white font-extrabold text-xs grid place-items-center shrink-0 mt-0.5">
                    cc
                  </div>
                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    {panelLine && (
                      <p className="text-sm md:text-base font-medium leading-snug text-white/95 line-clamp-2">
                        <span className="font-bold text-[#93C5FD]">{panelSpeakerName}: </span>
                        {panelLine}
                      </p>
                    )}
                    {candidateLine && (
                      <p className="text-sm md:text-base font-medium leading-snug text-white/80 line-clamp-2">
                        <span className="font-bold text-emerald-300">You: </span>
                        {candidateLine}
                      </p>
                    )}
                    {!panelLine && !candidateLine && (
                      <p className="text-sm md:text-base font-medium leading-snug text-white/45 italic">
                        Captions will appear here once the panel starts speaking.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Spacer for symmetrical balance */}
              <div className="w-16 hidden md:block" />
            </div>
          </div>
        </main>

        {/* RIGHT COLUMN: AI Interviewer Tiles & Synced Panel Context */}
        <aside className="w-[380px] shrink-0 flex flex-col justify-between gap-3.5 min-h-0">
          {/* 3 AI Interviewer Tiles */}
          <div className="flex-1 flex flex-col justify-between gap-3.5 min-h-0">
            {PANEL.map(p => (
              <PanelistTile
                key={p.id}
                panelist={p}
                speaking={currentSpeaker === p.id}
                bid={bids.find(b => b.panelist === p.id)}
                avatarUrl={AVATARS[p.id]}
                onSelect={() => setActiveSpeakerId(p.id)}
              />
            ))}
          </div>

          {/* Context Synced Box & Speaker Pill */}
          <div className="flex flex-col gap-3 shrink-0">
            {/* Panel context synced card */}
            <div className="bg-white rounded-2xl p-4 border border-[#EBE6DF] shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-gray-900 leading-tight">Panel context synced</span>
                  <span className="text-xs text-gray-500 leading-tight mt-0.5">Shared candidate context across all interviewers</span>
                </div>
              </div>

              <button
                onClick={() => setShowContextDrawer(true)}
                className="border-2 border-[#2563EB] text-[#2563EB] hover:bg-blue-50 font-extrabold text-xs md:text-sm px-4 py-1.5 rounded-xl transition-colors cursor-pointer"
              >
                View
              </button>
            </div>

            {/* Bottom Status: Arjun Mehta is speaking or Panel Listening */}
            <div className={`border text-sm font-bold px-4 py-2.5 rounded-2xl flex items-center gap-2.5 shadow-2xs transition-colors ${
              speakerInfo ? 'bg-[#EFF6FF] border-[#BFDBFE] text-gray-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}>
              <svg className={`w-5 h-5 ${speakerInfo ? 'text-[#2563EB]' : 'text-emerald-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.111 16.404a5.5 5.5 0 010-7.778M12 12h.01m3.878-4.404a5.5 5.5 0 010 7.778M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728" />
              </svg>
              <span>{speakerInfo ? `${speakerInfo.name} is speaking` : 'Panel listening for candidate answer...'}</span>
            </div>
          </div>
        </aside>
      </div>

      {/* ---------------------------------------------------- BOTTOM CONTROLS BAR */}
      <footer className="h-22 shrink-0 bg-white border-t border-[#EBE6DF] px-10 flex items-center justify-between z-20 shadow-xs">
        {/* Left Action Buttons */}
        <div className="flex items-center gap-8">
          {/* Mic Button */}
          <button
            onClick={toggleMic}
            className="flex flex-col items-center gap-1.5 text-gray-700 hover:text-gray-950 transition-colors cursor-pointer group"
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all shadow-2xs group-hover:scale-105 ${
              micOn ? 'border-[#EBE6DF] bg-white text-gray-700 hover:bg-gray-50' : 'border-red-200 bg-red-50 text-red-600'
            }`}>
              {micOn ? (
                <svg className="w-6 h-6 text-[#2563EB]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </div>
            <span className="text-xs font-semibold text-gray-800">Mic</span>
          </button>

          {/* Camera Button */}
          <button
            onClick={toggleCamera}
            className="flex flex-col items-center gap-1.5 text-gray-700 hover:text-gray-950 transition-colors cursor-pointer group"
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all shadow-2xs group-hover:scale-105 ${
              cameraOn ? 'border-[#EBE6DF] bg-white text-gray-700 hover:bg-gray-50' : 'border-red-200 bg-red-50 text-red-600'
            }`}>
              {cameraOn ? (
                <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </div>
            <span className="text-xs font-semibold text-gray-800">Camera</span>
          </button>

          {/* Captions Button */}
          <button
            onClick={() => setCaptionsOn(!captionsOn)}
            className="flex flex-col items-center gap-1.5 text-gray-700 hover:text-gray-950 transition-colors cursor-pointer group"
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all shadow-2xs group-hover:scale-105 ${
              captionsOn ? 'border-blue-200 bg-blue-50 text-[#2563EB]' : 'border-[#EBE6DF] bg-white text-gray-700 hover:bg-gray-50'
            }`}>
              <span className="font-extrabold text-sm tracking-wider">CC</span>
            </div>
            <span className="text-xs font-semibold text-gray-800">Captions</span>
          </button>

          {/* Screen Share */}
          <button
            onClick={() => setScreenSharing(!screenSharing)}
            className="flex flex-col items-center gap-1.5 text-gray-700 hover:text-gray-950 transition-colors cursor-pointer group"
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all shadow-2xs group-hover:scale-105 ${
              screenSharing ? 'border-blue-200 bg-blue-50 text-[#2563EB]' : 'border-[#EBE6DF] bg-white text-gray-700 hover:bg-gray-50'
            }`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 11l5-5m0 0l5 5m-5-5v12M4 18v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-gray-800">Screen Share</span>
          </button>

          {/* Raise Hand */}
          <button
            onClick={() => setHandRaised(!handRaised)}
            className="flex flex-col items-center gap-1.5 text-gray-700 hover:text-gray-950 transition-colors cursor-pointer group"
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all shadow-2xs group-hover:scale-105 ${
              handRaised ? 'border-amber-200 bg-amber-50 text-amber-600' : 'border-[#EBE6DF] bg-white text-gray-700 hover:bg-gray-50'
            }`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-gray-800">Raise Hand</span>
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowContextDrawer(true)}
            className="flex flex-col items-center gap-1.5 text-gray-700 hover:text-gray-950 transition-colors cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center border border-[#EBE6DF] bg-white text-gray-700 hover:bg-gray-50 shadow-2xs group-hover:scale-105">
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-gray-800">Settings</span>
          </button>
        </div>

        {/* Center Hangup Button */}
        <div className="flex items-center">
          <button
            onClick={onEnd}
            title="End Interview"
            className="w-15 h-15 rounded-full bg-[#EF4444] hover:bg-red-600 text-white flex items-center justify-center shadow-xl hover:shadow-red-500/30 transition-all active:scale-95 cursor-pointer"
          >
            <svg className="w-7 h-7 transform rotate-[135deg]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-2.2 2.2a15.053 15.053 0 01-6.59-6.59l2.2-2.21a.96.96 0 00.25-1A11.36 11.36 0 018.5 3.99c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.49c.01-.55-.44-1-1-.12z" />
            </svg>
          </button>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-8">
          {/* Interview Guide */}
          <button
            onClick={() => setShowGuideModal(true)}
            className="flex flex-col items-center gap-1.5 text-gray-700 hover:text-gray-950 transition-colors cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center border border-[#EBE6DF] bg-white text-gray-700 hover:bg-gray-50 shadow-2xs group-hover:scale-105">
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-gray-800">Interview Guide</span>
          </button>

          {/* Help */}
          <button
            onClick={() => setShowHelpModal(true)}
            className="flex flex-col items-center gap-1.5 text-gray-700 hover:text-gray-950 transition-colors cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center border border-[#EBE6DF] bg-white text-gray-700 hover:bg-gray-50 shadow-2xs group-hover:scale-105">
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-gray-800">Help</span>
          </button>
        </div>
      </footer>

      {/* ---------------------------------------------------- CONTEXT SLIDE-OVER DRAWER */}
      <BidRail
        model={model}
        bids={bids}
        isOpen={showContextDrawer}
        onClose={() => setShowContextDrawer(false)}
      />

      {/* ---------------------------------------------------- INTERVIEW GUIDE MODAL */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-3xl p-7 shadow-2xl border border-[#EBE6DF] flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#EBE6DF]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#2563EB] grid place-items-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Panel Interview Guide</h3>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="text-gray-400 hover:text-gray-600 w-9 h-9 rounded-xl hover:bg-gray-100 grid place-items-center text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="text-sm text-gray-600 leading-relaxed flex flex-col gap-3.5">
              <p>
                Welcome to your <strong>Kyro Adaptive Panel Interview</strong>. You are being interviewed simultaneously by 3 specialized AI interviewers:
              </p>
              <ul className="list-disc pl-5 flex flex-col gap-2 text-gray-700 font-medium">
                <li><strong>Arjun Mehta (Technical Architect):</strong> Probes system design, latency, scaling trade-offs, and technical depth.</li>
                <li><strong>Ananya Shah (Product Manager):</strong> Evaluates customer impact, product metrics, requirement scoping, and prioritization.</li>
                <li><strong>Rohan Iyer (HR / Behavioural):</strong> Assesses cross-functional collaboration, ownership, team dynamics, and culture fit.</li>
              </ul>
              <p className="bg-[#FAF9F6] p-4 rounded-2xl border border-[#EBE6DF] text-xs leading-relaxed text-gray-700">
                💡 <strong>Tip:</strong> Speak clearly and answer naturally. The panel shares a single synchronized state and will adaptively bid for turns based on what you discuss.
              </p>
            </div>
            <button
              onClick={() => setShowGuideModal(false)}
              className="mt-1 w-full h-11 rounded-xl bg-[#2563EB] text-white font-bold text-sm hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- HELP MODAL */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl p-7 shadow-2xl border border-[#EBE6DF] flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#EBE6DF]">
              <h3 className="text-lg font-bold text-gray-900">Audio &amp; Video Support</h3>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-gray-400 hover:text-gray-600 w-9 h-9 rounded-xl hover:bg-gray-100 grid place-items-center text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="text-sm text-gray-600 leading-relaxed flex flex-col gap-3">
              <p>Having trouble hearing or speaking with the AI panel?</p>
              <div className="flex flex-col gap-2.5">
                <div className="p-3.5 bg-[#FAF9F6] rounded-2xl border border-[#EBE6DF]">
                  <span className="font-bold text-gray-900 text-sm">1. Check Microphone Permissions</span>
                  <p className="text-gray-500 text-xs mt-1">Ensure your browser has microphone and camera permissions allowed for localhost.</p>
                </div>
                <div className="p-3.5 bg-[#FAF9F6] rounded-2xl border border-[#EBE6DF]">
                  <span className="font-bold text-gray-900 text-sm">2. Real-Time Captions</span>
                  <p className="text-gray-500 text-xs mt-1">Captions display live transcriptions of candidate responses and interviewer statements.</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowHelpModal(false)}
              className="mt-1 w-full h-11 rounded-xl bg-gray-900 text-white font-bold text-sm hover:bg-black transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
