import { useState, useEffect } from 'react';
import type { Scorecard } from '@kyro/shared';
import ScheduleInterview from '../components/ScheduleInterview.js';
import ThemeToggle from '../components/ThemeToggle.js';
import { TableRowSkeleton } from '../components/SkeletonLoader.js';
import { VERDICT } from '../lib/labels.js';
import EmptyState from '../components/EmptyState.js';
import { authedFetch, signOut } from '../lib/supabase.js';

interface Props {
  onBack: () => void;
  onSelectScorecard: (scorecard: Scorecard) => void;
  localHistory?: Scorecard[];
}

function formatDuration(sec?: number) {
  if (!sec) return '15m 00s';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function formatDate(val?: number | string | Date) {
  if (!val) return 'Recent';
  const d = new Date(val);
  if (isNaN(d.getTime())) return 'Recent';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CompanyPortal({ onBack, onSelectScorecard, localHistory = [] }: Props) {
  const [scorecards, setScorecards] = useState<Scorecard[]>(localHistory);
  const [loading, setLoading] = useState(localHistory.length === 0);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [verdictFilter, setVerdictFilter] = useState<string>('all');

  useEffect(() => {
    let mounted = true;
    async function fetchScorecards() {
      setLoading(true);
      try {
        const res = await authedFetch('/scorecards');
        if (res.ok) {
          const data: Scorecard[] = await res.json();
          if (mounted && Array.isArray(data)) {
            setScorecards(data);
          }
        }
      } catch (err) {
        console.warn('Could not load scorecards from server:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void fetchScorecards();
    return () => { mounted = false; };
  }, []);

  const filtered = scorecards.filter(sc => {
    const matchesSearch =
      sc.candidateName.toLowerCase().includes(search.toLowerCase()) ||
      sc.role.toLowerCase().includes(search.toLowerCase()) ||
      (sc.level && sc.level.toLowerCase().includes(search.toLowerCase()));

    const matchesLevel =
      levelFilter === 'all' ||
      (sc.level && sc.level.toLowerCase().includes(levelFilter.toLowerCase()));

    // Get dominant verdict or first verdict
    const mainVerdict = sc.verdicts[0]?.verdict || 'lean_hire';
    const matchesVerdict =
      verdictFilter === 'all' || mainVerdict.toLowerCase() === verdictFilter.toLowerCase();

    return matchesSearch && matchesLevel && matchesVerdict;
  });

  // Calculate high level stats
  const totalCount = scorecards.length;
  const hireCount = scorecards.filter(s => s.verdicts.some(v => v.verdict === 'hire')).length;
  const avgTechScore = totalCount > 0
    ? (scorecards.reduce((acc, s) => acc + (s.verdicts.find(v => v.panelist === 'technical')?.score || 0), 0) / totalCount).toFixed(1)
    : '—';

  return (
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-[#0F1115] text-[#181A20] dark:text-[#F9FAFB] font-sans flex flex-col select-none transition-colors duration-200">
      {/* Top Header */}
      <header className="h-16 sm:h-[72px] sticky top-0 z-20 border-b border-[#EBE6DF] dark:border-[#222631] bg-white dark:bg-[#161920] px-3.5 sm:px-8 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-white dark:bg-[#1E232D] border border-[#EBE6DF] dark:border-[#2D333F] flex items-center justify-center shadow-2xs overflow-hidden p-1 shrink-0">
            <img src="/favicon.png" alt="Kyro Panel Logo" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-display font-extrabold text-base sm:text-xl text-gray-950 dark:text-white shrink-0">Kyro Panel</span>
              <span className="hidden xs:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-extrabold bg-[#F4F1EA] dark:bg-[#1E232D] text-[#78644E] dark:text-[#CBB9A4] border border-[#E6DAC8] dark:border-[#2D333F] truncate">
                Recruiter Portal
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <ThemeToggle />
          <button
            onClick={onBack}
            className="h-8.5 sm:h-10 px-3 sm:px-4 rounded-lg sm:rounded-xl border border-[#EBE6DF] dark:border-[#222631] bg-white dark:bg-[#161920] hover:bg-gray-50 dark:hover:bg-[#1E232D] text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Home</span>
          </button>

          <button
            onClick={() => void signOut()}
            className="h-8.5 sm:h-10 px-3 sm:px-4 rounded-lg sm:rounded-xl border border-[#EBE6DF] dark:border-[#222631] bg-white dark:bg-[#161920] hover:bg-gray-50 dark:hover:bg-[#1E232D] text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200 transition-colors shadow-2xs cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="max-w-[1240px] w-full mx-auto px-3.5 sm:px-8 py-6 sm:py-8 flex flex-col gap-6">
        <ScheduleInterview />

        {/* Top Header Banner & Stats */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6 bg-white dark:bg-[#161920] rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-[#EBE6DF] dark:border-[#222631] shadow-xs">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl sm:text-3xl font-extrabold text-gray-950 dark:text-white font-display tracking-tight">
              Candidate Assessments &amp; Scorecards
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium">
              Review AI interview evaluations, cross-examinations, competency scores, and full candidate reports.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-6 border-t md:border-t-0 md:border-l border-[#EBE6DF] dark:border-[#222631] pt-4 md:pt-0 md:pl-8">
            <div className="flex flex-col">
              <span className="text-[10px] sm:text-[11px] font-extrabold tracking-wider text-gray-400 uppercase font-mono">Candidates</span>
              <span className="text-xl sm:text-2xl font-display font-extrabold text-gray-950 dark:text-white mt-0.5">{totalCount}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] sm:text-[11px] font-extrabold tracking-wider text-gray-400 uppercase font-mono">Hires</span>
              <span className="text-xl sm:text-2xl font-display font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">{hireCount}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] sm:text-[11px] font-extrabold tracking-wider text-gray-400 uppercase font-mono">Avg Score</span>
              <span className="text-xl sm:text-2xl font-display font-extrabold text-[#2563EB] dark:text-blue-400 mt-0.5">{avgTechScore}</span>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-[#161920] p-4 rounded-2xl border border-[#EBE6DF] dark:border-[#222631] shadow-xs">
          {/* Search Input */}
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search candidate, role, or level..."
              className="w-full pl-9.5 pr-4 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-[#1E232D] border border-[#EBE6DF] dark:border-[#2D333F] text-xs sm:text-sm font-semibold text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB] transition-all"
            />
            <div className="absolute left-3 top-3 text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Level Filter */}
            <select
              value={levelFilter}
              onChange={e => setLevelFilter(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#1E232D] border border-[#EBE6DF] dark:border-[#2D333F] text-xs font-semibold text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#2563EB] cursor-pointer"
            >
              <option value="all">All Levels</option>
              <option value="intern">Intern</option>
              <option value="beginner">Beginner (0-2y)</option>
              <option value="intermediate">Intermediate (2-6y)</option>
              <option value="expert">Expert (6-11+y)</option>
            </select>

            {/* Verdict Filter */}
            <select
              value={verdictFilter}
              onChange={e => setVerdictFilter(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#1E232D] border border-[#EBE6DF] dark:border-[#2D333F] text-xs font-semibold text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#2563EB] cursor-pointer"
            >
              <option value="all">All Verdicts</option>
              <option value="hire">Hire</option>
              <option value="lean_hire">Lean Hire</option>
              <option value="lean_no_hire">Lean No Hire</option>
              <option value="no_hire">No Hire</option>
            </select>
          </div>
        </div>

        {/* Candidates Table */}
        <div className="bg-white dark:bg-[#161920] rounded-3xl border border-[#EBE6DF] dark:border-[#222631] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#EBE6DF] dark:border-[#222631] bg-[#FAF9F6] dark:bg-[#1E232D] text-[11px] font-extrabold tracking-wider text-[#A48D78] dark:text-[#CBB9A4] uppercase font-mono">
                  <th className="px-6 py-4">Candidate</th>
                  <th className="px-6 py-4">Role &amp; Level</th>
                  <th className="px-6 py-4">Duration</th>
                  <th className="px-6 py-4 text-center">Tech (Arjun)</th>
                  <th className="px-6 py-4 text-center">Product (Ananya)</th>
                  <th className="px-6 py-4 text-center">HR (Rohan)</th>
                  <th className="px-6 py-4 text-center">Verdict</th>
                  <th className="px-6 py-4 text-right">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-[#222631]">
                {loading ? (
                  <TableRowSkeleton rows={4} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-4">
                      <EmptyState
                        icon="📋"
                        title={scorecards.length === 0 ? 'No candidate assessments yet' : 'No matching assessments found'}
                        description={
                          scorecards.length === 0
                            ? 'Schedule an interview above and share the invite link with a candidate to start seeing live scorecards.'
                            : 'No assessment records match your search query or filter selection.'
                        }
                        actionLabel={search || levelFilter !== 'all' || verdictFilter !== 'all' ? 'Clear Filters' : undefined}
                        onAction={
                          search || levelFilter !== 'all' || verdictFilter !== 'all'
                            ? () => {
                                setSearch('');
                                setLevelFilter('all');
                                setVerdictFilter('all');
                              }
                            : undefined
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filtered.map(sc => {
                    const tech = sc.verdicts.find(v => v.panelist === 'technical');
                    const prod = sc.verdicts.find(v => v.panelist === 'product');
                    const hr = sc.verdicts.find(v => v.panelist === 'hr');
                    const dominantVerdict = tech?.verdict || 'lean_hire';
                    const verdictStyle = VERDICT[dominantVerdict] ?? VERDICT.lean_hire;

                    return (
                      <tr key={sc.sessionId} className="hover:bg-gray-50/80 dark:hover:bg-[#1E232D]/70 transition-colors">
                        {/* Candidate Name */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[#2563EB] dark:text-blue-400 font-display font-extrabold text-xs grid place-items-center shrink-0">
                              {sc.candidateName.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-gray-950 dark:text-white">{sc.candidateName}</span>
                              <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">{formatDate(sc.timestamp)}</span>
                            </div>
                          </div>
                        </td>

                        {/* Role & Level */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-gray-900 dark:text-gray-200">{sc.role}</span>
                            {sc.level && (
                              <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/50 text-[#2563EB] dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 w-fit">
                                {sc.level}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Duration */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-mono font-bold text-gray-800 dark:text-gray-200">
                              {formatDuration(sc.durationSec)}
                            </span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-semibold">
                              {sc.turns ? `${sc.turns} turns` : 'Full session'}
                            </span>
                          </div>
                        </td>

                        {/* Tech Score */}
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center justify-center font-mono text-xs font-extrabold px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            {tech ? tech.score.toFixed(1) : '—'}
                          </span>
                        </td>

                        {/* Product Score */}
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center justify-center font-mono text-xs font-extrabold px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            {prod ? prod.score.toFixed(1) : '—'}
                          </span>
                        </td>

                        {/* HR Score */}
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center justify-center font-mono text-xs font-extrabold px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                            {hr ? hr.score.toFixed(1) : '—'}
                          </span>
                        </td>

                        {/* Overall Verdict */}
                        <td className="px-6 py-4 text-center">
                          <span
                            className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-extrabold tracking-wider border"
                            style={{
                              color: verdictStyle.color,
                              backgroundColor: verdictStyle.bg,
                              borderColor: verdictStyle.border,
                            }}
                          >
                            {verdictStyle.label}
                          </span>
                        </td>

                        {/* Action View Report */}
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => onSelectScorecard(sc)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#181A20] dark:bg-[#F9FAFB] hover:bg-black dark:hover:bg-white text-white dark:text-[#0F1115] text-xs font-bold transition-all shadow-xs hover:shadow-md cursor-pointer active:scale-95"
                          >
                            <span>View Report</span>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
