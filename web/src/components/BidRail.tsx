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
  isOpen: boolean;
  onClose: () => void;
}

const CLAIM_STYLE: Record<Claim['status'], { label: string; color: string; bg: string; border: string }> = {
  contradicted: { label: 'CONTRADICTION', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  vague: { label: 'UNQUANTIFIED', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  verified: { label: 'CORROBORATED', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  open: { label: 'TRACKED', color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
};

function skillColor(v: number): string {
  if (v < 0.35) return '#EF4444';
  if (v < 0.6) return '#D97706';
  return '#2563EB';
}

export default function BidRail({ model, bids, isOpen, onClose }: Props) {
  if (!isOpen) return null;

  const flagged = model.claims.filter(c => c.status === 'vague' || c.status === 'contradicted').length;
  const claims = [...model.claims].reverse();

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      <aside className="relative w-full max-w-lg bg-white h-full shadow-2xl border-l border-[#EBE6DF] flex flex-col z-10 animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
        <div className="h-[72px] px-8 border-b border-[#EBE6DF] flex items-center justify-between bg-[#FAF9F6]">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-[#2563EB] grid place-items-center shadow-2xs">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-extrabold text-gray-900 leading-tight">Shared Candidate Model</h2>
              <p className="text-xs text-gray-500 font-medium">Live multi-agent synchronized context</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 grid place-items-center transition-colors cursor-pointer text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-7">
          {/* Turn Bids Section */}
          <section className="bg-[#FAF9F6] border border-[#EBE6DF] rounded-3xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-gray-800">Turn Bids &amp; Intent</span>
              </div>
              <span className="text-xs font-bold text-gray-600 bg-white px-2.5 py-1 rounded-lg border border-[#EBE6DF]">
                Turn {model.turns}
              </span>
            </div>

            {bids.length === 0 ? (
              <p className="text-xs md:text-sm text-gray-400 italic py-2">Waiting for candidate response...</p>
            ) : (
              <div className="flex flex-col gap-3 pt-1">
                {bids.map(bid => {
                  const p = panelistById(bid.panelist);
                  const won = bid.panelist === model.lastSpeaker;
                  return (
                    <div key={bid.panelist} className="bg-white rounded-2xl p-4 border border-[#EBE6DF] flex flex-col gap-2 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
                          <span className="text-sm font-bold text-gray-950">{p.name}</span>
                          <span className="text-xs text-gray-500 font-medium">({p.role.split(' ')[0]})</span>
                        </div>
                        {won && (
                          <span className="text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md">
                            CURRENT SPEAKER
                          </span>
                        )}
                        <span className="text-xs font-mono font-extrabold text-gray-800">
                          {bid.score.toFixed(2)}
                        </span>
                      </div>

                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden mt-1">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${bid.score * 100}%`, background: p.color }}
                        />
                      </div>

                      <p className="text-xs text-gray-700 leading-relaxed mt-0.5">
                        <span className="font-bold capitalize text-gray-900">[{bid.intent}]:</span> {bid.reason}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Competency Signal */}
          <section className="bg-white border border-[#EBE6DF] rounded-3xl p-5 flex flex-col gap-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-gray-800">Competency Signal</span>
              <span className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                Difficulty Level {model.difficulty}
              </span>
            </div>

            <div className="flex flex-col gap-3.5 pt-1">
              {(Object.keys(COMPETENCIES) as CompetencyId[]).map(id => (
                <div key={id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs md:text-sm">
                    <span className="font-semibold text-gray-800">{COMPETENCIES[id]}</span>
                    <span className="font-mono font-bold text-gray-950">{(model.skills[id] * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#F4F1EA] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${model.skills[id] * 100}%`, background: skillColor(model.skills[id]) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Claims Ledger */}
          <section className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-gray-800">Claims Ledger</span>
              <span className="text-xs text-gray-500 font-medium">
                {model.claims.length} tracked · <span className="text-amber-600 font-bold">{flagged} flagged</span>
              </span>
            </div>

            {claims.length === 0 ? (
              <div className="bg-[#FAF9F6] border border-dashed border-[#EBE6DF] rounded-2xl p-6 text-center text-xs md:text-sm text-gray-400">
                No factual claims recorded yet.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {claims.map(claim => {
                  const s = CLAIM_STYLE[claim.status];
                  return (
                    <div
                      key={claim.id}
                      className="rounded-2xl p-4 flex flex-col gap-2 border transition-all shadow-2xs"
                      style={{ borderColor: s.border, background: s.bg }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold tracking-wider px-2.5 py-1 rounded-md" style={{ color: s.color, background: `${s.color}15` }}>
                          {s.label}
                        </span>
                        <span className="font-mono text-xs font-semibold text-gray-400">{claim.t}s</span>
                      </div>
                      <p className="text-xs md:text-sm text-gray-900 leading-relaxed font-medium">
                        &ldquo;{claim.text}&rdquo;
                      </p>
                      {claim.note && (
                        <p className="text-xs font-bold mt-0.5" style={{ color: s.color }}>
                          Note: {claim.note}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
