import { useState, useEffect } from 'react';
import type { Scorecard } from '@kyro/shared';
import ScheduleInterview from '../components/ScheduleInterview.js';
import ThemeToggle from '../components/ThemeToggle.js';
import { TableRowSkeleton } from '../components/SkeletonLoader.js';
import EmptyState from '../components/EmptyState.js';
import { authedFetch, signOut } from '../lib/supabase.js';

interface Props {
  onBack: () => void;
  onSelectScorecard: (scorecard: Scorecard) => void;
  localHistory?: Scorecard[];
}

const VERDICT_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  hire: { label: 'HIRE', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  lean_hire: { label: 'LEAN HIRE', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  lean_no_hire: { label: 'LEAN NO HIRE', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  no_hire: { label: 'NO HIRE', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
};

function formatDuration(sec?: number) {
  if (!sec) return '15m 00s';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function formatDate(isoString?: string) {
  if (!isoString) return 'Recent';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Fallback mock history for company presentation
const DEFAULT_COMPANY_HISTORY: Scorecard[] = [
  {
    sessionId: 'session-demo-01',
    candidateName: 'Alex Rivera',
    role: 'Senior Full Stack Engineer',
    level: 'Expert (6-11+ years)',
    timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
    durationSec: 924,
    turns: 18,
    verdicts: [
      {
        panelist: 'technical',
        verdict: 'hire',
        score: 4.8,
        confidence: 0.94,
        rationale: 'Deep mastery of distributed messaging systems, sub-second latency optimizations, and high scalability.',
        evidence: [
          { quote: 'Architected Agora real-time stream synchronization with optimistic token bucket backoff.', t: 180 },
          { quote: 'Demonstrated exceptional knowledge of WebRTC state machine failures and recovery strategies.', t: 340 },
        ],
        ratings: { architecture: 4.9, implementation: 4.7, problemSolving: 4.8 },
      },
      {
        panelist: 'product',
        verdict: 'hire',
        score: 4.6,
        confidence: 0.9,
        rationale: 'Balanced technical rigor with clear product delivery goals and user experience focus.',
        evidence: [
          { quote: 'Prioritized candidate turn latency to prevent awkward conversational pauses over purely speculative edge features.', t: 420 },
        ],
        ratings: { userFocus: 4.6, tradeOffs: 4.7, productThinking: 4.5 },
      },
      {
        panelist: 'hr',
        verdict: 'lean_hire',
        score: 4.2,
        confidence: 0.88,
        rationale: 'Excellent communication clarity and leadership potential.',
        evidence: [
          { quote: 'Led previous team through high stress zero-downtime database migration.', t: 560 },
        ],
        ratings: { ownership: 4.3, communication: 4.5, problemSolving: 3.8 },
      },
    ],
    claims: [
      { id: 'c1', text: 'Built distributed high-concurrency websocket cluster handling 100k peak CCU.', t: 210, status: 'verified' },
      { id: 'c2', text: 'Engineered multi-agent LLM auction logic with dynamic priority scoring.', t: 450, status: 'verified' },
    ],
  },
  {
    sessionId: 'session-demo-02',
    candidateName: 'Priya Sharma',
    role: 'Frontend & WebRTC Specialist',
    level: 'Intermediate (2-6 years)',
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
    durationSec: 810,
    turns: 15,
    verdicts: [
      {
        panelist: 'technical',
        verdict: 'lean_hire',
        score: 4.1,
        confidence: 0.86,
        rationale: 'Solid frontend fundamentals, React lifecycle knowledge, and Web Audio API familiarity.',
        evidence: [
          { quote: 'Constructed custom Web Audio visualizer and noise reduction filter pipeline.', t: 240 },
        ],
        ratings: { architecture: 3.9, implementation: 4.3, problemSolving: 4.1 },
      },
      {
        panelist: 'product',
        verdict: 'hire',
        score: 4.5,
        confidence: 0.91,
        rationale: 'Extremely strong intuition for recruiter UX, interactive scorecards, and design tokens.',
        evidence: [
          { quote: 'Designed minimal cognitive load layout for real-time interview floor bidding rails.', t: 310 },
        ],
        ratings: { userFocus: 4.8, tradeOffs: 4.4, productThinking: 4.3 },
      },
      {
        panelist: 'hr',
        verdict: 'hire',
        score: 4.3,
        confidence: 0.87,
        rationale: 'High proactive ownership, user empathy, clear communication under deadlines, and team collaboration.',
        evidence: [
          { quote: 'Took direct responsibility for candidate onboarding experience and streamlined the assessment report layout.', t: 470 },
        ],
        ratings: { ownership: 4.4, communication: 4.4, problemSolving: 4.1 },
      },
    ],
    claims: [
      { id: 'c1', text: 'Implemented pre-join device verification greenroom with real-time mic waveform analyzer.', t: 150, status: 'verified' },
      { id: 'c2', text: 'Engineered candidate assessment matrix and interactive recruiter dashboard.', t: 390, status: 'verified' },
    ],
  },
];

export default function CompanyPortal({ onBack, onSelectScorecard, localHistory = [] }: Props) {
  const initialData = localHistory.length > 0 ? localHistory : DEFAULT_COMPANY_HISTORY;
  const [scorecards, setScorecards] = useState<Scorecard[]>(initialData);
  const [loading, setLoading] = useState(false);
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
          if (mounted && Array.isArray(data) && data.length > 0) {
            setScorecards(data);
          }
        }
      } catch (err) {
        console.warn('Could not load scorecards from server, using initial data:', err);
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
    ? (scorecards.reduce((acc, s) => acc + (s.verdicts.find(v => v.panelist === 'technical')?.score || 3.5), 0) / totalCount).toFixed(1)
    : '4.2';

  return (
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-[#0F1115] text-[#181A20] dark:text-[#F9FAFB] font-sans flex flex-col select-none transition-colors duration-200">
      {/* Top Header */}
      <header className="h-[72px] sticky top-0 z-20 border-b border-[#EBE6DF] dark:border-[#222631] bg-white dark:bg-[#161920] px-6 sm:px-8 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-white dark:bg-[#1E232D] border border-[#EBE6DF] dark:border-[#2D333F] flex items-center justify-center shadow-2xs overflow-hidden p-1.5">
            <img src="/favicon.png" alt="Kyro Panel Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-extrabold text-lg md:text-xl text-gray-950 dark:text-white">Kyro Panel</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-[#F4F1EA] dark:bg-[#1E232D] text-[#78644E] dark:text-[#CBB9A4] border border-[#E6DAC8] dark:border-[#2D333F]">
                Company Recruiter Portal
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            onClick={onBack}
            className="h-10 px-4 rounded-xl border border-[#EBE6DF] dark:border-[#222631] bg-white dark:bg-[#161920] hover:bg-gray-50 dark:hover:bg-[#1E232D] text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200 transition-colors shadow-2xs cursor-pointer flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Home</span>
          </button>

          <button
            onClick={() => void signOut()}
            className="h-10 px-4 rounded-xl border border-[#EBE6DF] dark:border-[#222631] bg-white dark:bg-[#161920] hover:bg-gray-50 dark:hover:bg-[#1E232D] text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200 transition-colors shadow-2xs cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="max-w-[1240px] w-full mx-auto px-6 sm:px-8 py-8 flex flex-col gap-6">
        <ScheduleInterview />

        {/* Top Header Banner & Stats */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white dark:bg-[#161920] rounded-3xl p-6 sm:p-8 border border-[#EBE6DF] dark:border-[#222631] shadow-xs">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-950 dark:text-white font-display tracking-tight">
              Candidate Assessments &amp; Scorecards
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium">
              Review AI interview evaluations, cross-examinations, competency scores, and full candidate reports.
            </p>
          </div>

          <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-[#EBE6DF] dark:border-[#222631] pt-4 md:pt-0 md:pl-8">
            <div className="flex flex-col">
              <span className="text-[11px] font-extrabold tracking-wider text-gray-400 uppercase font-mono">Total Candidates</span>
              <span className="text-2xl font-display font-extrabold text-gray-950 dark:text-white mt-0.5">{totalCount}</span>
            </div>
            <div className="w-px h-8 bg-[#EBE6DF] dark:bg-[#222631]" />
            <div className="flex flex-col">
              <span className="text-[11px] font-extrabold tracking-wider text-gray-400 uppercase font-mono">Hire Verdicts</span>
              <span className="text-2xl font-display font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">{hireCount}</span>
            </div>
            <div className="w-px h-8 bg-[#EBE6DF] dark:bg-[#222631]" />
            <div className="flex flex-col">
              <span className="text-[11px] font-extrabold tracking-wider text-gray-400 uppercase font-mono">Avg Tech Score</span>
              <span className="text-2xl font-display font-extrabold text-[#2563EB] dark:text-blue-400 mt-0.5">{avgTechScore}</span>
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
                        title="No candidate assessments found"
                        description="No assessment records match your search query or filter selection."
                        actionLabel="Clear Filters"
                        onAction={() => {
                          setSearch('');
                          setLevelFilter('all');
                          setVerdictFilter('all');
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  filtered.map(sc => {
                    const tech = sc.verdicts.find(v => v.panelist === 'technical');
                    const prod = sc.verdicts.find(v => v.panelist === 'product');
                    const hr = sc.verdicts.find(v => v.panelist === 'hr');
                    const dominantVerdict = tech?.verdict || 'lean_hire';
                    const verdictStyle = VERDICT_STYLES[dominantVerdict] || VERDICT_STYLES.lean_hire;

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
