import { COMPETENCIES, PANEL, type CompetencyId, type PanelistId, type Scorecard, panelistById } from '@kyro/shared';
import { AVATARS, CLAIM, VERDICT } from '../lib/labels.js';
import ThemeToggle from '../components/ThemeToggle.js';

interface Props {
  scorecard: Scorecard;
  onBack: () => void;
}

function mmss(sec?: number) {
  if (!sec) return '00:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function Scorecard({ scorecard, onBack }: Props) {
  const competencies = Object.keys(COMPETENCIES) as CompetencyId[];

  return (
    <div className="h-full overflow-y-auto bg-[#FAF9F6] dark:bg-[#0F1115] text-[#181A20] dark:text-[#F9FAFB] font-sans select-none transition-colors duration-200">
      {/* Header */}
      <header className="h-[72px] sticky top-0 z-10 border-b border-[#EBE6DF] dark:border-[#222631] bg-white dark:bg-[#161920] px-6 sm:px-10 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-white dark:bg-[#1E232D] border border-[#EBE6DF] dark:border-[#2D333F] flex items-center justify-center shadow-2xs overflow-hidden p-1.5">
            <img src="/favicon.png" alt="Kyro Panel Logo" className="w-full h-full object-contain" />
          </div>
          <span className="font-display font-extrabold text-lg md:text-xl text-gray-900 dark:text-white">Kyro Panel</span>
          <span className="w-px h-6 bg-[#EBE6DF] dark:bg-[#222631] mx-1.5" />
          <span className="text-xs md:text-sm font-bold text-gray-700 dark:text-gray-300 bg-[#F4F1EA] dark:bg-[#1E232D] px-3 py-1 rounded-xl border border-[#E6DAC8] dark:border-[#2D333F]">
            {scorecard.candidateName}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            onClick={onBack}
            className="h-10 px-5 rounded-xl border border-[#EBE6DF] dark:border-[#222631] bg-white dark:bg-[#161920] hover:bg-gray-50 dark:hover:bg-[#1E232D] text-xs md:text-sm font-bold text-gray-800 dark:text-gray-200 transition-colors shadow-2xs cursor-pointer"
          >
            ← Return
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-[1160px] mx-auto px-6 sm:px-8 py-10 flex flex-col gap-8">
        {/* Top Summary Header */}
        <section className="bg-white dark:bg-[#161920] rounded-3xl p-8 md:p-10 border border-[#EBE6DF] dark:border-[#222631] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold tracking-widest text-[#A48D78] dark:text-[#CBB9A4] uppercase font-mono">
                Assessment Scorecard
              </span>
              {scorecard.level && (
                <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#2563EB] dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                  {scorecard.level}
                </span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-950 dark:text-white font-display">
              {scorecard.role}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
              Three separate verdicts across {Object.values(COMPETENCIES).slice(0, 3).join(', ').toLowerCase()} and more — kept apart, never averaged.
            </p>
          </div>

          <div className="flex items-center gap-8 border-t md:border-t-0 md:border-l border-[#EBE6DF] dark:border-[#222631] pt-6 md:pt-0 md:pl-8">
            {[
              ['DURATION', mmss(scorecard.durationSec)],
              ['QUOTES CITED', String(scorecard.verdicts.reduce((n, v) => n + v.evidence.length, 0))],
              ['CLAIMS TRACKED', String(scorecard.claims.length)],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="text-xs font-bold tracking-wider text-gray-400 dark:text-gray-500">{label}</span>
                <span className="font-mono text-2xl font-extrabold text-gray-900 dark:text-white">{value}</span>
              </div>
            ))}
          </div>
        </section>

        {scorecard.dissent && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/40 px-6 py-4 flex items-center gap-3.5 shadow-2xs">
            <span className="text-xs font-bold tracking-wider text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-2.5 py-1 rounded-lg">
              DISSENT
            </span>
            <span className="text-sm text-amber-950 dark:text-amber-200 font-semibold">
              The AI panel expressed differing perspectives across technical depth vs cross-functional team alignment criteria — preserved without artificial averaging.
            </span>
          </div>
        )}

        {/* 3 Verdict Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {scorecard.verdicts.map(v => {
            const p = panelistById(v.panelist);
            const style = VERDICT[v.verdict] || VERDICT.lean_hire;
            return (
              <div
                key={v.panelist}
                className="rounded-3xl border border-[#EBE6DF] dark:border-[#222631] bg-white dark:bg-[#161920] p-6 flex flex-col gap-5 shadow-xs transition-all hover:shadow-md"
              >
                <div className="flex items-center gap-3.5">
                  <img
                    src={AVATARS[v.panelist]}
                    alt={p.name}
                    className="w-13 h-13 rounded-2xl object-cover border border-[#EBE6DF] dark:border-[#222631] shadow-2xs"
                  />
                  <div className="flex flex-col">
                    <span className="text-base font-extrabold text-gray-950 dark:text-white">{p.name}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold">{p.role}</span>
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

                <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 font-normal">{v.rationale}</p>

                <div className="flex flex-col gap-2.5 pt-3 border-t border-[#FAF9F6] dark:border-[#222631]">
                  <span className="text-xs font-extrabold tracking-widest text-[#A48D78] dark:text-[#CBB9A4] uppercase">
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
                        <span className="font-mono text-xs font-bold text-gray-400 dark:text-gray-500">{mmss(e.t)}</span>
                        <span className="text-xs leading-relaxed text-gray-800 dark:text-gray-200 italic">&ldquo;{e.quote}&rdquo;</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Competency Matrix Table */}
        <section className="rounded-3xl border border-[#EBE6DF] dark:border-[#222631] bg-white dark:bg-[#161920] overflow-hidden shadow-xs">
          <div className="px-8 py-5 border-b border-[#EBE6DF] dark:border-[#222631] flex items-center justify-between bg-[#FAF9F6] dark:bg-[#1E232D]">
            <div>
              <h3 className="font-display text-base font-extrabold text-gray-900 dark:text-white">Competency Matrix</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Breakdown of grading across individual interviewer rubrics</p>
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">— denotes out-of-scope</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#EBE6DF] dark:border-[#222631] bg-[#FAF9F6] dark:bg-[#1E232D]">
                  <th className="px-8 py-3.5 text-xs font-bold tracking-widest text-[#A48D78] dark:text-[#CBB9A4] uppercase">
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
              <tbody className="divide-y divide-gray-100 dark:divide-[#222631]">
                {competencies.map(c => (
                  <tr key={c} className="hover:bg-gray-50/70 dark:hover:bg-[#1E232D]/70 transition-colors">
                    <td className="px-8 py-4 text-sm font-semibold text-gray-900 dark:text-gray-200">{COMPETENCIES[c]}</td>
                    {scorecard.verdicts.map(v => (
                      <td key={v.panelist} className="px-8 py-4 font-mono text-sm font-bold text-right text-gray-800 dark:text-gray-200">
                        {v.ratings[c] === undefined
                          ? <span className="text-gray-300 dark:text-gray-600 font-normal">&mdash;</span>
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
            <h3 className="font-display text-base font-extrabold text-gray-900 dark:text-white">Claims &amp; Corroboration Ledger</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold">{scorecard.claims.length} claims tracked</span>
          </div>

          {scorecard.claims.length === 0 ? (
            <div className="bg-white dark:bg-[#161920] rounded-2xl p-6 border border-[#EBE6DF] dark:border-[#222631] text-center text-sm text-gray-500 dark:text-gray-400">
              No technical or project claims were flagged during this session.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scorecard.claims.map(claim => {
                const s = CLAIM[claim.status] ?? CLAIM.open;
                return (
                  <div
                    key={claim.id}
                    className="rounded-2xl border bg-white dark:bg-[#161920] p-5 flex flex-col gap-2.5 shadow-2xs"
                    style={{ borderColor: s.border }}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="text-xs font-bold tracking-wider px-2.5 py-1 rounded-md"
                        style={{ color: s.color, background: s.bg }}
                      >
                        {s.label}
                      </span>
                      <span className="font-mono text-xs font-semibold text-gray-400 dark:text-gray-500">{mmss(claim.t)}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-200 leading-relaxed">&ldquo;{claim.text}&rdquo;</p>
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

        {/* The conversation itself, last because it is the reference rather than
            the summary: the verdicts quote two lines each, and a recruiter who
            disagrees with one needs to be able to read what surrounded it. */}
        {scorecard.transcript && scorecard.transcript.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-extrabold text-gray-950 dark:text-white font-display">Full Transcript</h2>
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">
                {scorecard.transcript.length} turns
              </span>
            </div>

            <div className="rounded-2xl border border-[#EBE6DF] dark:border-[#222631] bg-white dark:bg-[#161920] divide-y divide-[#EBE6DF] dark:divide-[#222631] overflow-hidden">
              {scorecard.transcript.map((turn, i) => {
                const candidate = turn.speaker === 'candidate';
                return (
                  <div key={i} className="px-6 py-4 flex gap-4">
                    <span className="font-mono text-xs font-semibold text-gray-400 dark:text-gray-500 pt-0.5 shrink-0 w-12">
                      {mmss(turn.t)}
                    </span>
                    <span
                      className={`text-xs font-bold tracking-wide shrink-0 w-24 pt-0.5 ${
                        candidate
                          ? 'text-gray-900 dark:text-gray-200'
                          : 'text-[#A48D78] dark:text-[#CBB9A4]'
                      }`}
                    >
                      {candidate ? scorecard.candidateName.split(' ')[0] : panelistById(turn.speaker as PanelistId).name.split(' ')[0]}
                    </span>
                    <p className="text-sm text-gray-800 dark:text-gray-300 leading-relaxed">{turn.text}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
