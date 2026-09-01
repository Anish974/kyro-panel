import type { Bid, Panelist } from '@kyro/shared';

interface Props {
  panelist: Panelist;
  bid?: Bid;
  speaking: boolean;
  queuePosition?: number;
}

/** Fixed bar heights — a waveform that looks alive without re-rendering state. */
const WAVE = [6, 13, 18, 10, 16, 7, 12];

export default function PanelistTile({ panelist, bid, speaking, queuePosition }: Props) {
  const accent = panelist.color;

  return (
    <div
      className="rounded-2xl p-4 flex flex-col justify-between border relative overflow-hidden transition-colors"
      style={{
        background: speaking ? 'linear-gradient(165deg,#1a1e2e,#131722)' : 'var(--color-card)',
        borderColor: speaking ? accent : 'var(--color-edge-2)',
        boxShadow: speaking ? `0 0 0 1px ${accent}33, 0 0 34px ${accent}1f` : 'none',
      }}
    >
      {speaking && (
        <div
          className="absolute -top-16 -right-12 w-52 h-52 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${accent}2e 0%, transparent 70%)` }}
        />
      )}

      <div className="flex items-start justify-between relative">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl grid place-items-center font-display text-base font-semibold border"
            style={{
              background: 'var(--color-raised)',
              borderColor: speaking ? accent : 'var(--color-edge-3)',
              color: accent,
              boxShadow: speaking ? `0 0 0 3px ${accent}24` : 'none',
            }}
          >
            {panelist.name[0]}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">{panelist.name}</span>
            <span className="text-[11px] text-ink-3">{panelist.role}</span>
          </div>
        </div>

        {speaking ? (
          <span
            className="font-mono text-[10px] tracking-widest rounded-md px-2 py-1 border"
            style={{ color: accent, borderColor: `${accent}55`, background: `${accent}1a` }}
          >
            FLOOR
          </span>
        ) : bid ? (
          <span className="font-mono text-[10px] tracking-wider rounded-md px-2 py-1 border border-edge-3 text-ink-2">
            BID {bid.score.toFixed(2)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 relative">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-widest" style={{ color: speaking ? accent : 'var(--color-ink-3)' }}>
            {speaking ? 'SPEAKING' : queuePosition ? 'QUEUED TO SPEAK' : 'LISTENING'}
          </span>

          {speaking ? (
            <div className="flex items-center gap-[3px] h-[18px]">
              {WAVE.map((h, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-sm animate-pulse"
                  style={{ height: h, background: accent, animationDelay: `${i * 90}ms` }}
                />
              ))}
            </div>
          ) : (
            <span className="text-[11px] text-ink-3">{queuePosition ? `${queuePosition}${queuePosition === 2 ? 'nd' : 'rd'}` : ''}</span>
          )}
        </div>

        {!speaking && bid && (
          <div className="h-[3px] rounded-sm bg-edge-2 overflow-hidden">
            <div
              className="h-[3px] rounded-sm transition-all duration-500"
              style={{ width: `${bid.score * 100}%`, background: accent }}
            />
          </div>
        )}

        {bid && !speaking && (
          <span className="text-[11px] leading-snug text-ink-3 line-clamp-1">{bid.reason}</span>
        )}
      </div>
    </div>
  );
}
