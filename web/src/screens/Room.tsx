import { useEffect, useRef, useState } from 'react';
import { PANEL, panelistById } from '@kyro/shared';
import { useSession } from '../lib/useSession.js';
import { joinAsCandidate, leave, type JoinResult } from '../lib/agora.js';
import PanelistTile from '../components/PanelistTile.js';
import BidRail from '../components/BidRail.js';

const CHANNEL = 'demo-channel';

interface Props {
  candidateName: string;
  /** Builds the three verdicts from the model as it stands and shows them. */
  onEnd: () => void;
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function Room({ candidateName, onEnd }: Props) {
  const { model, bids, speaking, caption, heard, connected } = useSession();
  const [session, setSession] = useState<JoinResult | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const videoRef = useRef<HTMLDivElement>(null);

  // Play the local camera into its tile once we have a track and a container.
  useEffect(() => {
    if (session?.camera && videoRef.current) session.camera.play(videoRef.current);
  }, [session]);

  useEffect(() => () => { void leave(session); }, [session]);

  async function join() {
    setError(null);
    setJoining(true);
    try {
      setSession(await joinAsCandidate(CHANNEL));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setJoining(false);
    }
  }

  async function toggleMic() {
    if (!session) return;
    const next = !micOn;
    await session.mic.setEnabled(next);
    setMicOn(next);
  }

  // Everyone who is not on the floor, ranked by how badly they want it.
  const queue = bids
    .filter(b => b.panelist !== speaking)
    .sort((a, b) => b.score - a.score)
    .map(b => b.panelist);

  return (
    <div className="h-full flex flex-col bg-base">
      <header className="h-14 shrink-0 border-b border-edge bg-panel px-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-technical to-hr" />
            <span className="font-display text-sm font-semibold">Kyro Panel</span>
          </div>
          <span className="w-px h-5 bg-edge-2" />
          <div className="flex items-center gap-2">
            <span className="w-[7px] h-[7px] rounded-full bg-danger" />
            <span className="font-mono text-xs">{clock(model.elapsed)}</span>
            <span className="text-xs text-ink-3">/ 25:00</span>
          </div>
          <span className="w-px h-5 bg-edge-2" />
          <span className="text-[13px] text-ink-2">Senior Backend Engineer · Round 1</span>
        </div>

        <div className="flex items-center gap-2 border border-[#2a2318] bg-[#16120b] rounded-lg px-2.5 py-1">
          <span className="font-mono text-[11px] tracking-wider text-warn">ALL INTERVIEWERS ARE AI</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: connected ? 'var(--color-hr)' : 'var(--color-danger)' }}
            />
            <span className="font-mono text-[11px] text-ink-2">{connected ? 'PANEL LIVE' : 'NO SERVER'}</span>
          </span>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <main className="flex-1 p-5 flex flex-col gap-3.5 min-w-0">
          <div className="grid grid-cols-3 gap-3.5 h-[200px] shrink-0">
            {PANEL.map(p => (
              <PanelistTile
                key={p.id}
                panelist={p}
                bid={bids.find(b => b.panelist === p.id)}
                speaking={speaking === p.id}
                queuePosition={queue.indexOf(p.id) >= 0 ? queue.indexOf(p.id) + 2 : undefined}
              />
            ))}
          </div>

          {model.scenario && (
            <div
              className="shrink-0 rounded-2xl border px-4 py-3 flex gap-3.5 items-start"
              style={{
                borderColor: `${panelistById(model.scenario.openedBy).color}55`,
                background: `${panelistById(model.scenario.openedBy).color}12`,
              }}
            >
              <span
                className="font-mono text-[10px] tracking-widest mt-0.5 shrink-0"
                style={{ color: panelistById(model.scenario.openedBy).color }}
              >
                ROLE-PLAY
              </span>
              <p className="text-[15px] leading-relaxed text-ink-2 flex-1">{model.scenario.premise}</p>
              <span className="font-mono text-[10px] text-ink-3 shrink-0 mt-0.5">
                {model.scenario.turns + 1}/3
              </span>
            </div>
          )}

          <div className="flex-1 min-h-0 rounded-2xl border border-edge-2 relative overflow-hidden grid place-items-center bg-gradient-to-b from-[#14181f] to-[#0f1319]">
            <div ref={videoRef} className="absolute inset-0" />

            {!session && (
              <div className="relative flex flex-col items-center gap-4">
                <div className="w-24 h-24 rounded-full bg-raised border border-edge-3 grid place-items-center font-display text-3xl font-semibold text-ink-2">
                  {candidateName.split(' ').map(w => w[0]).join('')}
                </div>
                <button
                  onClick={join}
                  disabled={joining}
                  className="h-11 px-6 rounded-xl bg-technical text-base font-semibold text-[15px] disabled:opacity-50"
                  style={{ color: '#08090d' }}
                >
                  {joining ? 'Joining…' : 'Join the panel'}
                </button>
                {error && <span className="text-xs text-danger max-w-sm text-center">{error}</span>}
              </div>
            )}

            {session && (
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/70 border border-edge-3 rounded-lg px-3 py-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: micOn ? 'var(--color-hr)' : 'var(--color-danger)' }}
                />
                <span className="text-[13px] font-medium">{candidateName}</span>
                <span className="text-xs text-ink-3">You</span>
              </div>
            )}
          </div>

          <div className="shrink-0 rounded-2xl border border-edge-2 bg-[#0f1218] px-4 py-3.5 flex gap-3.5 items-start min-h-[68px]">
            <span className="font-mono text-[10px] tracking-widest text-ink-3 mt-1 shrink-0">CAPTIONS</span>
            <div className="flex flex-col gap-1.5 flex-1">
              {/* What we heard, always on screen — otherwise the room looks deaf
                  for the second the panel spends deciding. */}
              {heard && (
                <p className="text-[15px] leading-relaxed text-ink-3">
                  <span className="font-semibold text-ink-2">You:</span> {heard}
                </p>
              )}
              {caption ? (
                <p className="text-[15px] leading-relaxed text-ink-2">
                  <span className="font-semibold" style={{ color: panelistById(caption.speaker as never).color }}>
                    {panelistById(caption.speaker as never).name}:
                  </span>{' '}
                  {caption.text}
                </p>
              ) : (
                !heard && <p className="text-[15px] text-ink-3">waiting for the panel…</p>
              )}
            </div>
          </div>
        </main>

        <BidRail model={model} bids={bids} />
      </div>

      <footer className="h-[76px] shrink-0 border-t border-edge bg-panel px-5 flex items-center justify-between">
        <span className="text-xs text-ink-3">Recording · transcript building</span>

        <div className="flex items-center gap-2.5">
          <button
            onClick={toggleMic}
            disabled={!session}
            className="h-12 px-5 rounded-xl font-semibold text-[13px] disabled:opacity-40"
            style={{
              background: micOn && session ? 'var(--color-hr)' : 'var(--color-card)',
              color: micOn && session ? '#08090d' : 'var(--color-ink-2)',
              border: micOn && session ? 'none' : '1px solid var(--color-edge-3)',
            }}
          >
            {micOn ? 'Mic on' : 'Mic off'}
          </button>

          <button
            onClick={async () => { await leave(session); setSession(null); }}
            disabled={!session}
            className="h-12 px-5 rounded-xl border border-[#4a2320] bg-[#1a100e] text-danger font-semibold text-[13px] disabled:opacity-40"
          >
            Leave panel
          </button>

          <button
            onClick={async () => { await leave(session); setSession(null); onEnd(); }}
            disabled={model.turns === 0}
            className="h-12 px-5 rounded-xl border border-edge-3 bg-card font-semibold text-[13px] text-ink-2 disabled:opacity-40"
          >
            End &amp; score
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-3">Question {model.turns} of ~10</span>
          <div className="w-24 h-1 rounded-sm bg-edge-2 overflow-hidden">
            <div
              className="h-1 rounded-sm bg-technical transition-all"
              style={{ width: `${Math.min(model.turns / 10, 1) * 100}%` }}
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
