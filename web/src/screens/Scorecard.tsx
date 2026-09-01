import {
  COMPETENCIES,
  PANEL,
  panelistById,
  type Claim,
  type CompetencyId,
  type Scorecard as ScorecardData,
  type Verdict,
} from '@kyro/shared';

interface Props {
  scorecard: ScorecardData;
  onBack: () => void;
}

const VERDICT: Record<Verdict, { label: string; color: string; bg: string; border: string }> = {
  hire: { label: 'HIRE', color: '#46c9b0', bg: '#0e1917', border: '#1f3a35' },
  lean_hire: { label: 'LEAN HIRE', color: '#8fd4a8', bg: '#0e1714', border: '#22352c' },
  lean_no_hire: { label: 'LEAN NO HIRE', color: '#f0b429', bg: '#16120b', border: '#2a2318' },
  no_hire: { label: 'NO HIRE', color: '#ff7a6b', bg: '#170f0e', border: '#3a2420' },
};

const CLAIM_LABEL: Record<Claim['status'], { label: string; color: string }> = {
  contradicted: { label: 'CONTRADICTED', color: '#ff7a6b' },
  vague: { label: 'UNQUANTIFIED', color: '#f0b429' },
  verified: { label: 'CORROBORATED', color: '#46c9b0' },
  open: { label: 'TRACKED', color: '#6b7488' },
};

function mmss(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function Scorecard({ scorecard, onBack }: Props) {
  const competencies = Object.keys(COMPETENCIES) as CompetencyId[];

  return (
    <div className="h-full overflow-y-auto bg-base">
      <header className="h-14 sticky top-0 z-10 border-b border-edge bg-panel px-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-technical to-hr" />
          <span className="font-display text-sm font-semibold">Kyro Panel</span>
          <span className="w-px h-5 bg-edge-2 mx-2" />
          <span className="text-[13px] text-ink-2">{scorecard.candidateName}</span>
        </div>
        <button
          onClick={onBack}
          className="h-9 px-4 rounded-lg border border-edge-3 bg-card text-[13px] font-medium text-ink-2"
        >
          Back to the room
        </button>
      </header>

      <div className="max-w-[1100px] mx-auto px-6 py-8 flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <span className="font-mono text-[11px] tracking-widest text-ink-3">360° EVIDENCE SCORECARD</span>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{scorecard.role}</h1>
          <div className="flex gap-6 mt-2">
            {[
              ['DURATION', mmss(scorecard.durationSec)],
              ['QUOTES CITED', String(scorecard.verdicts.reduce((n, v) => n + v.evidence.length, 0))],
              ['CLAIMS TRACKED', String(scorecard.claims.length)],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="font-mono text-[10px] tracking-widest text-ink-3">{label}</span>
                <span className="font-mono text-lg">{value}</span>
              </div>
            ))}
          </div>
        </section>

        {scorecard.dissent && (
          <div className="rounded-xl border border-[#2a2318] bg-[#16120b] px-4 py-3 flex items-center gap-3">
            <span className="font-mono text-[10px] tracking-widest text-warn">DISSENT</span>
            <span className="text-[13px] text-ink-2">
              The panel did not agree — and we did not average it away.
            </span>
          </div>
        )}

        <section className="grid grid-cols-3 gap-4">
          {scorecard.verdicts.map(v => {
            const p = panelistById(v.panelist);
            const style = VERDICT[v.verdict];
            return (
              <div key={v.panelist} className="rounded-2xl border border-edge-2 bg-card p-4 flex flex-col gap-3.5">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl grid place-items-center font-display font-semibold border"
                    style={{ background: 'var(--color-raised)', borderColor: 'var(--color-edge-3)', color: p.color }}
                  >
                    {p.name[0]}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{p.name}</span>
                    <span className="text-[11px] text-ink-3">{p.role}</span>
                  </div>
                </div>

                <span
                  className="font-mono text-[11px] tracking-widest rounded-lg px-2.5 py-1.5 border self-start"
                  style={{ color: style.color, background: style.bg, borderColor: style.border }}
                >
                  {style.label}
                </span>

                <div className="flex items-baseline gap-2">
                  <span className="font-display text-2xl font-semibold" style={{ color: style.color }}>
                    {v.score.toFixed(1)}
                  </span>
                  <span className="text-[11px] text-ink-3">/ 5 · confidence {v.confidence.toFixed(2)}</span>
                </div>

                <p className="text-xs leading-relaxed text-ink-2">{v.rationale}</p>

                <div className="flex flex-col gap-2">
                  <span className="font-mono text-[10px] tracking-widest text-ink-3">EVIDENCE</span>
                  {v.evidence.length === 0 && (
                    <span className="text-[11px] text-ink-3">nothing in this interview to cite</span>
                  )}
                  {v.evidence.map(e => (
                    <div
                      key={e.t + e.quote}
                      className="border-l-2 pl-2.5 flex flex-col gap-1"
                      style={{ borderColor: p.color }}
                    >
                      <span className="font-mono text-[10px] text-ink-3">{mmss(e.t)}</span>
                      <span className="text-[11px] leading-snug text-ink-2">&ldquo;{e.quote}&rdquo;</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        <section className="rounded-2xl border border-edge-2 bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-edge-2 flex items-center justify-between">
            <span className="font-display text-sm font-semibold">Competency matrix</span>
            <span className="text-[11px] text-ink-3">Per-interviewer rubric · a dash means they do not grade it</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-edge-2">
                  <th className="px-4 py-2.5 font-mono text-[10px] tracking-widest text-ink-3 font-normal">
                    COMPETENCY
                  </th>
                  {PANEL.map(p => (
                    <th
                      key={p.id}
                      className="px-4 py-2.5 font-mono text-[10px] tracking-widest font-normal text-right"
                      style={{ color: p.color }}
                    >
                      {p.name.split(' ')[0].toUpperCase()}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 font-mono text-[10px] tracking-widest text-ink-3 font-normal text-right">
                    SPREAD
                  </th>
                </tr>
              </thead>
              <tbody>
                {competencies.map(c => {
                  const cells = scorecard.verdicts.map(v => v.ratings[c]);
                  const given = cells.filter((n): n is number => n !== undefined);
                  const spread = given.length > 1 ? Math.max(...given) - Math.min(...given) : 0;
                  return (
                    <tr key={c} className="border-b border-edge last:border-0">
                      <td className="px-4 py-2.5 text-[13px] text-ink-2">{COMPETENCIES[c]}</td>
                      {cells.map((n, i) => (
                        <td key={i} className="px-4 py-2.5 font-mono text-[13px] text-right">
                          {n === undefined ? <span className="text-ink-3">&mdash;</span> : n.toFixed(1)}
                        </td>
                      ))}
                      <td
                        className="px-4 py-2.5 font-mono text-[13px] text-right"
                        style={{ color: spread >= 1 ? 'var(--color-warn)' : 'var(--color-ink-3)' }}
                      >
                        {spread.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex flex-col gap-2.5 pb-10">
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-semibold">Claims ledger</span>
            <span className="text-[11px] text-ink-3">{scorecard.claims.length} tracked</span>
          </div>
          {scorecard.claims.length === 0 && (
            <span className="text-[11px] text-ink-3">no checkable claims were made</span>
          )}
          {scorecard.claims.map(claim => {
            const s = CLAIM_LABEL[claim.status];
            return (
              <div key={claim.id} className="rounded-xl border border-edge-2 bg-card px-4 py-3 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] tracking-wider" style={{ color: s.color }}>
                    {s.label}
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-ink-3">{mmss(claim.t)}</span>
                </div>
                <span className="text-[13px] leading-snug text-ink-2">{claim.text}</span>
                {claim.note && (
                  <span className="text-[11px]" style={{ color: s.color }}>
                    {claim.note}
                  </span>
                )}
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
