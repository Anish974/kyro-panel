import {
  COMPETENCIES,
  panelistById,
  type Bid,
  type CandidateModel,
  type Claim,
  type CompetencyId,
} from '@kyro/shared';

interface Props {
  model: CandidateModel;
  bids: Bid[];
}

const CLAIM_STYLE: Record<Claim['status'], { label: string; color: string; bg: string; border: string }> = {
  contradicted: { label: 'CONTRADICTION', color: '#ff7a6b', bg: '#170f0e', border: '#3a2420' },
  vague: { label: 'UNQUANTIFIED', color: '#f0b429', bg: '#16120b', border: '#2a2318' },
  verified: { label: 'CORROBORATED', color: '#46c9b0', bg: '#0e1917', border: '#1f3a35' },
  open: { label: 'TRACKED', color: '#6b7488', bg: 'transparent', border: '#232833' },
};

/** Competency bars turn amber then red as a score drops — a gap should look like one. */
function skillColor(v: number): string {
  if (v < 0.35) return 'var(--color-danger)';
  if (v < 0.6) return 'var(--color-warn)';
  return 'var(--color-technical)';
}

export default function BidRail({ model, bids }: Props) {
  const flagged = model.claims.filter(c => c.status === 'vague' || c.status === 'contradicted').length;
  // Newest first — the live ones are what a viewer is watching for.
  const claims = [...model.claims].reverse().slice(0, 4);

  return (
    <aside className="w-[360px] shrink-0 border-l border-edge bg-panel p-[18px] flex flex-col gap-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm font-semibold tracking-tight">Shared Candidate Model</span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-hr" />
          <span className="font-mono text-[10px] tracking-wider text-ink-3">LIVE</span>
        </span>
      </div>

      <section className="border border-edge-2 bg-card rounded-xl p-3.5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-widest text-ink-3">TURN BIDS</span>
          <span className="text-[11px] text-ink-3">{model.turns} turns</span>
        </div>

        {bids.length === 0 ? (
          <span className="text-[11px] text-ink-3">waiting for the first answer</span>
        ) : (
          <div className="flex flex-col gap-2.5">
            {bids.map(bid => {
              const p = panelistById(bid.panelist);
              const won = bid.panelist === model.lastSpeaker;
              return (
                <div key={bid.panelist} className="flex items-center gap-2.5">
                  <span className="w-14 text-xs" style={{ color: won ? p.color : 'var(--color-ink-2)' }}>
                    {p.name.split(' ')[0]}
                  </span>
                  <div className="flex-1 h-1.5 rounded-sm bg-edge-2 overflow-hidden">
                    <div
                      className="h-1.5 rounded-sm transition-all duration-500"
                      style={{ width: `${bid.score * 100}%`, background: won ? p.color : `${p.color}66` }}
                    />
                  </div>
                  <span
                    className="w-8 text-right font-mono text-[11px]"
                    style={{ color: won ? p.color : 'var(--color-ink-3)' }}
                  >
                    {bid.score.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-widest text-ink-3">COMPETENCY SIGNAL</span>
          <span className="font-mono text-[10px] tracking-wider text-warn border border-[#2a2318] bg-[#16120b] rounded-md px-1.5 py-0.5">
            DIFFICULTY L{model.difficulty}
          </span>
        </div>

        <div className="flex flex-col gap-2.5">
          {(Object.keys(COMPETENCIES) as CompetencyId[]).map(id => (
            <div key={id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-2">{COMPETENCIES[id]}</span>
                <span className="font-mono text-[11px] text-ink-2">{model.skills[id].toFixed(2)}</span>
              </div>
              <div className="h-1 rounded-sm bg-edge-2 overflow-hidden">
                <div
                  className="h-1 rounded-sm transition-all duration-700"
                  style={{ width: `${model.skills[id] * 100}%`, background: skillColor(model.skills[id]) }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2.5 min-h-0">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-widest text-ink-3">CLAIMS LEDGER</span>
          <span className="text-[11px] text-ink-3">
            {model.claims.length} tracked · {flagged} flagged
          </span>
        </div>

        {claims.length === 0 && <span className="text-[11px] text-ink-3">nothing claimed yet</span>}

        {claims.map(claim => {
          const s = CLAIM_STYLE[claim.status];
          return (
            <div
              key={claim.id}
              className="rounded-xl p-3 flex flex-col gap-1.5 border"
              style={{ borderColor: s.border, background: s.bg }}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] tracking-wider" style={{ color: s.color }}>
                  {s.label}
                </span>
                <span className="ml-auto font-mono text-[10px] text-ink-3">{claim.t}s</span>
              </div>
              <span className="text-xs leading-snug text-ink-2">{claim.text}</span>
              {claim.note && (
                <span className="text-[11px] leading-snug" style={{ color: s.color }}>
                  {claim.note}
                </span>
              )}
            </div>
          );
        })}
      </section>

      {model.gaps.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] tracking-widest text-ink-3">OPEN GAPS</span>
          {model.gaps.map(g => (
            <span key={g} className="text-[11px] text-warn">
              {g}
            </span>
          ))}
        </section>
      )}
    </aside>
  );
}
