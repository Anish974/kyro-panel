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
  hire: { label: 'HIRE', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  lean_hire: { label: 'LEAN HIRE', color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4' },
  lean_no_hire: { label: 'LEAN NO HIRE', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  no_hire: { label: 'NO HIRE', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
};

const CLAIM_LABEL: Record<Claim['status'], { label: string; color: string; bg: string; border: string }> = {
  contradicted: { label: 'CONTRADICTED', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  vague: { label: 'UNQUANTIFIED', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  verified: { label: 'CORROBORATED', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  open: { label: 'TRACKED', color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
};

const AVATARS: Record<string, string> = {
  technical: '/assets/arjun_mehta.jpg',
  product: '/assets/ananya_shah.jpg',
  hr: '/assets/rohan_iyer.jpg',
};

function mmss(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function Scorecard({ scorecard, onBack }: Props) {
  const competencies = Object.keys(COMPETENCIES) as CompetencyId[];

  return (
    <div className="h-full overflow-y-auto bg-[#FAF9F6] text-gray-900 font-sans select-none">
      {/* Header */}
      <header className="h-[72px] sticky top-0 z-10 border-b border-[#EBE6DF] bg-white px-10 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#2563EB] shadow-2xs">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.122H1.5v-.125zM14.25 19.25a5.625 5.625 0 00-1.875-4.148 7.87 7.87 0 014.875-1.727 6.375 6.375 0 016.375 6.375v.125h-9.375v-.625z" />
            </svg>
          </div>
          <span className="font-display font-extrabold text-lg md:text-xl text-gray-900">Kyro Panel</span>
          <span className="w-px h-6 bg-[#EBE6DF] mx-1.5" />
          <span className="text-xs md:text-sm font-bold text-gray-700 bg-[#F4F1EA] px-3 py-1 rounded-xl border border-[#E6DAC8]">
            {scorecard.candidateName}
          </span>
        </div>

        <button
          onClick={onBack}
          className="h-10 px-5 rounded-xl border border-[#EBE6DF] bg-white hover:bg-gray-50 text-xs md:text-sm font-bold text-gray-800 hover:text-gray-950 transition-colors shadow-2xs cursor-pointer"
        >
          ← Return
        </button>
      </header>

      {/* Main Container */}
      <div className="max-w-[1160px] mx-auto px-8 py-10 flex flex-col gap-8">
        {/* Top Summary Header */}
        <section className="bg-white rounded-3xl p-8 md:p-10 border border-[#EBE6DF] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold tracking-widest text-[#A48D78] uppercase font-mono">
                360° Assessment Scorecard
              </span>
              {scorecard.level && (
                <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-blue-50 text-[#2563EB] border border-blue-200">
                  {scorecard.level}
                </span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-950 font-display">
              {scorecard.role}
            </h1>
            <p className="text-sm text-gray-600 font-medium">
              Comprehensive evaluation across System Architecture, Product Thinking, and Team Alignment.
            </p>
          </div>

          <div className="flex items-center gap-8 border-t md:border-t-0 md:border-l border-[#EBE6DF] pt-6 md:pt-0 md:pl-8">
            {[
              ['DURATION', mmss(scorecard.durationSec)],
              ['QUOTES CITED', String(scorecard.verdicts.reduce((n, v) => n + v.evidence.length, 0))],
              ['CLAIMS TRACKED', String(scorecard.claims.length)],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="text-xs font-bold tracking-wider text-gray-400">{label}</span>
                <span className="font-mono text-2xl font-extrabold text-gray-900">{value}</span>
              </div>
            ))}
          </div>
        </section>

        {scorecard.dissent && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-6 py-4 flex items-center gap-3.5 shadow-2xs">
            <span className="text-xs font-bold tracking-wider text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg">
              DISSENT
            </span>
            <span className="text-sm text-amber-950 font-semibold">
              The AI panel expressed differing perspectives across technical depth vs cross-functional team alignment criteria — preserved without artificial averaging.
            </span>
          </div>
        )}

        {/* 3 Verdict Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {scorecard.verdicts.map(v => {
            const p = panelistById(v.panelist);
            const style = VERDICT[v.verdict];
            return (
              <div
                key={v.panelist}
                className="rounded-3xl border border-[#EBE6DF] bg-white p-6 flex flex-col gap-5 shadow-xs transition-all hover:shadow-md"
              >
                <div className="flex items-center gap-3.5">
                  <img
                    src={AVATARS[v.panelist]}
                    alt={p.name}
                    className="w-13 h-13 rounded-2xl object-cover border border-[#EBE6DF] shadow-2xs"
                  />
                  <div className="flex flex-col">
                    <span className="text-base font-extrabold text-gray-950">{p.name}</span>
                    <span className="text-xs text-gray-500 font-semibold">{p.role}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span
                    className="text-xs font-extrabold tracking-wider rounded-lg px-3 py-1.5 border"
                    style={{ color: style.color, background: style.bg, borderColor: style.border }}
                  >
                    {style.label}
                  </span>
                  <div className="flex items-baseline gap-1 font-mono">
                    <span className="text-2xl font-bold" style={{ color: style.color }}>
                      {v.score.toFixed(1)}
                    </span>
                    <span className="text-xs text-gray-400 font-semibold">/ 5.0</span>
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-gray-700 font-normal">{v.rationale}</p>

                <div className="flex flex-col gap-2.5 pt-3 border-t border-[#FAF9F6]">
                  <span className="text-xs font-extrabold tracking-widest text-[#A48D78] uppercase">
                    Cited Evidence
                  </span>
                  {v.evidence.length === 0 ? (
                    <span className="text-xs text-gray-400 italic">No direct quote recorded</span>
                  ) : (
                    v.evidence.map(e => (
                      <div
                        key={e.t + e.quote}
                        className="border-l-3 pl-3 flex flex-col gap-1"
                        style={{ borderColor: p.color }}
                      >
                        <span className="font-mono text-xs font-bold text-gray-400">{mmss(e.t)}</span>
                        <span className="text-xs leading-relaxed text-gray-800 italic">&ldquo;{e.quote}&rdquo;</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Competency Matrix Table */}
        <section className="rounded-3xl border border-[#EBE6DF] bg-white overflow-hidden shadow-xs">
          <div className="px-8 py-5 border-b border-[#EBE6DF] flex items-center justify-between bg-[#FAF9F6]">
            <div>
              <h3 className="font-display text-base font-extrabold text-gray-900">Competency Matrix</h3>
              <p className="text-xs text-gray-500 mt-0.5">Breakdown of grading across individual interviewer rubrics</p>
            </div>
            <span className="text-xs text-gray-400 font-medium">— denotes out-of-scope</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#EBE6DF] bg-[#FAF9F6]">
                  <th className="px-8 py-3.5 text-xs font-bold tracking-widest text-[#A48D78] uppercase">
                    COMPETENCY
                  </th>
                  {PANEL.map(p => (
                    <th
                      key={p.id}
                      className="px-8 py-3.5 text-xs font-bold tracking-widest uppercase text-right"
                      style={{ color: p.color }}
                    >
                      {p.name.split(' ')[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* No spread column. It was max-minus-min across the three
                    marks — a number with no reading attached, since a wide
                    spread can mean the panel genuinely disagreed or simply that
                    one of them barely covered that axis. The rationales below
                    say which, in words. */}
                {competencies.map(c => (
                  <tr key={c} className="border-b border-[#FAF9F6] last:border-0 hover:bg-gray-50/70 transition-colors">
                    <td className="px-8 py-4 text-sm font-semibold text-gray-900">{COMPETENCIES[c]}</td>
                    {scorecard.verdicts.map(v => (
                      <td key={v.panelist} className="px-8 py-4 font-mono text-sm font-bold text-right text-gray-800">
                        {v.ratings[c] === undefined
                          ? <span className="text-gray-300 font-normal">&mdash;</span>
                          : v.ratings[c]!.toFixed(1)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Claims Ledger */}
        <section className="flex flex-col gap-4 pb-14">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-extrabold text-gray-900">Claims &amp; Corroboration Ledger</h3>
            <span className="text-xs text-gray-500 font-semibold">{scorecard.claims.length} claims tracked</span>
          </div>

          {scorecard.claims.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 border border-[#EBE6DF] text-center text-sm text-gray-500">
              No technical or project claims were flagged during this session.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scorecard.claims.map(claim => {
                const s = CLAIM_LABEL[claim.status];
                return (
                  <div
                    key={claim.id}
                    className="rounded-2xl border bg-white p-5 flex flex-col gap-2.5 shadow-2xs"
                    style={{ borderColor: s.border }}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="text-xs font-bold tracking-wider px-2.5 py-1 rounded-md"
                        style={{ color: s.color, background: s.bg }}
                      >
                        {s.label}
                      </span>
                      <span className="font-mono text-xs font-semibold text-gray-400">{mmss(claim.t)}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 leading-relaxed">&ldquo;{claim.text}&rdquo;</p>
                    {claim.note && (
                      <p className="text-xs font-semibold" style={{ color: s.color }}>
                        {claim.note}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
