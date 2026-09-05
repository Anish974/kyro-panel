import { useEffect, useState } from 'react';
import type { Scorecard, Verdict } from '@kyro/shared';

interface Props {
  onBack: () => void;
  onSelectScorecard: (scorecard: Scorecard) => void;
  localHistory?: Scorecard[];
}

const VERDICT_STYLES: Record<Verdict, { label: string; color: string; bg: string; border: string }> = {
  hire: { label: 'HIRE', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  lean_hire: { label: 'LEAN HIRE', color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4' },
  lean_no_hire: { label: 'LEAN NO HIRE', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  no_hire: { label: 'NO HIRE', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatDate(timestamp?: number): string {
  if (!timestamp) return 'Recent';
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const DEFAULT_COMPANY_HISTORY: Scorecard[] = [
  {
    sessionId: 'kyro-anish-01',
    candidateName: 'Anish Patankar',
    role: 'Senior Backend Engineer',
    level: 'Expert (6-11+ years)',
    durationSec: 705,
    timestamp: Date.now() - 3600 * 1000 * 2,
    turns: 10,
    dissent: false,
    verdicts: [
      {
        panelist: 'technical',
        verdict: 'hire',
        score: 4.5,
        confidence: 0.92,
        rationale: 'Deep mastery of distributed async pipelines, low-latency streaming architectures, and multi-agent state orchestration.',
        evidence: [
          { quote: 'We designed an event-driven SSE and WebSocket bridge with in-memory state models to keep turn round-trip latency under 1200ms.', t: 215 },
          { quote: 'To prevent cascade failures during concurrent bidding, we isolated agent turns into a single round-trip evaluation cycle.', t: 460 },
        ],
        ratings: { systemDesign: 4.6, tradeoffReasoning: 4.4, communication: 4.5 },
      },
      {
        panelist: 'product',
        verdict: 'hire',
        score: 4.2,
        confidence: 0.89,
        rationale: 'Strong alignment on real-time candidate experience, audio silence coverage, and seamless interviewer pacing.',
        evidence: [
          { quote: 'We added synchronized presence and active speaker detection so candidates never felt they were talking over the panel.', t: 340 },
        ],
        ratings: { customerImpact: 4.3, tradeoffReasoning: 4.1, communication: 4.2 },
      },
      {
        panelist: 'hr',
        verdict: 'hire',
        score: 4.4,
        confidence: 0.9,
        rationale: 'Demonstrated direct architectural ownership, transparent risk management, and collaborative cross-functional execution.',
        evidence: [
          { quote: 'I led the end-to-end multi-agent protocol design and coordinated testing between backend services and client state.', t: 520 },
        ],
        ratings: { ownership: 4.6, communication: 4.4, tradeoffReasoning: 4.2 },
      },
    ],
    claims: [
      { id: 'c1', text: 'Designed and deployed multi-agent voice orchestration architecture achieving sub-1.2s response latency.', t: 180, status: 'verified' },
      { id: 'c2', text: 'Built real-time audio-level visualizer and WebRTC candidate stream synchronization.', t: 410, status: 'verified' },
    ],
  },
  {
    sessionId: 'kyro-nidhi-02',
    candidateName: 'Nidhi Dharme',
    role: 'Full-Stack Engineer',
    level: 'Intermediate (2-6 years)',
    durationSec: 630,
    timestamp: Date.now() - 3600 * 1000 * 5,
    turns: 9,
    dissent: false,
    verdicts: [
      {
        panelist: 'technical',
        verdict: 'hire',
        score: 4.2,
        confidence: 0.88,
        rationale: 'Clean component modularity, effective Web Audio API integration for live mic waveforms, and solid responsive UI state management.',
        evidence: [
          { quote: 'We connected the Web Audio API AnalyserNode directly to the canvas visualizer for real-time decibel level feedback.', t: 195 },
          { quote: 'Optimized rendering cycles to ensure camera preview and live closed captions stream without UI blocking.', t: 380 },
        ],
        ratings: { systemDesign: 4.1, tradeoffReasoning: 4.2, communication: 4.3 },
      },
      {
        panelist: 'product',
        verdict: 'hire',
        score: 4.4,
        confidence: 0.91,
        rationale: 'Outstanding product intuition for candidate comfort: pre-join greenroom checks, clear camera/mic toggles, and structured reports.',
        evidence: [
          { quote: 'Candidate confidence increases significantly when they can verify audio and video inputs in a dedicated pre-join greenroom.', t: 310 },
        ],
        ratings: { customerImpact: 4.6, tradeoffReasoning: 4.3, communication: 4.3 },
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
        ratings: { ownership: 4.4, communication: 4.4, tradeoffReasoning: 4.1 },
      },
    ],
    claims: [
      { id: 'c1', text: 'Implemented pre-join device verification greenroom with real-time mic waveform analyzer.', t: 150, status: 'verified' },
      { id: 'c2', text: 'Engineered 360° candidate assessment matrix and interactive recruiter dashboard.', t: 390, status: 'verified' },
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
        const res = await fetch('/scorecards');
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
    <div className="min-h-screen bg-[#FAF9F6] text-gray-900 font-sans flex flex-col select-none">
      {/* Top Header */}
      <header className="h-[72px] sticky top-0 z-20 border-b border-[#EBE6DF] bg-white px-8 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-[#181A20] flex items-center justify-center text-white shadow-2xs">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-extrabold text-lg md:text-xl text-gray-950">Kyro Panel</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-[#F4F1EA] text-[#78644E] border border-[#E6DAC8]">
                Company Recruiter Portal
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={onBack}
          className="h-10 px-5 rounded-xl border border-[#EBE6DF] bg-white hover:bg-gray-50 text-xs sm:text-sm font-bold text-gray-800 hover:text-gray-950 transition-colors shadow-2xs cursor-pointer flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span>Candidate Sign In</span>
        </button>
      </header>

      {/* Main Content Area */}
      <div className="max-w-[1240px] w-full mx-auto px-6 sm:px-8 py-8 flex flex-col gap-6">
        {/* Top Header Banner & Stats */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white rounded-3xl p-6 sm:p-8 border border-[#EBE6DF] shadow-xs">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-950 font-display tracking-tight">
              Candidate Assessments &amp; Scorecards
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 font-medium">
              Review AI interview evaluations, cross-examinations, competency scores, and full 360° candidate reports.
            </p>
          </div>

          <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-[#EBE6DF] pt-4 md:pt-0 md:pl-8">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider font-mono">Completed</span>
              <span className="text-2xl font-black text-gray-900 font-mono">{totalCount}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider font-mono">Strong Hires</span>
              <span className="text-2xl font-black text-emerald-600 font-mono">{hireCount}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider font-mono">Avg Tech</span>
              <span className="text-2xl font-black text-blue-600 font-mono">{avgTechScore}</span>
            </div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search candidate or role..."
              className="w-full px-4 py-2.5 pl-10 rounded-xl bg-white border border-[#EBE6DF] text-xs sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all"
            />
            <div className="absolute left-3.5 top-3 text-gray-400 pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 text-xs"
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
              className="px-3.5 py-2.5 rounded-xl bg-white border border-[#EBE6DF] text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2563EB] cursor-pointer"
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
              className="px-3.5 py-2.5 rounded-xl bg-white border border-[#EBE6DF] text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2563EB] cursor-pointer"
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
        <div className="bg-white rounded-3xl border border-[#EBE6DF] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#EBE6DF] bg-[#FAF9F6] text-[11px] font-extrabold tracking-wider text-[#A48D78] uppercase font-mono">
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
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-sm text-gray-500 font-medium">
                      {loading ? 'Loading assessments...' : 'No candidate assessment records found matching your filters.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map(sc => {
                    const tech = sc.verdicts.find(v => v.panelist === 'technical');
                    const prod = sc.verdicts.find(v => v.panelist === 'product');
                    const hr = sc.verdicts.find(v => v.panelist === 'hr');
                    const dominantVerdict = tech?.verdict || 'lean_hire';
                    const verdictStyle = VERDICT_STYLES[dominantVerdict];

                    return (
                      <tr key={sc.sessionId} className="hover:bg-gray-50/80 transition-colors">
                        {/* Candidate Name */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-200 text-[#2563EB] font-display font-extrabold text-xs grid place-items-center shrink-0">
                              {sc.candidateName.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-gray-950">{sc.candidateName}</span>
                              <span className="text-[11px] text-gray-400 font-mono">{formatDate(sc.timestamp)}</span>
                            </div>
                          </div>
                        </td>

                        {/* Role & Level */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-gray-900">{sc.role}</span>
                            {sc.level && (
                              <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-[#2563EB] border border-blue-200/60 w-fit">
                                {sc.level}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Duration */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-mono font-bold text-gray-800">
                              {formatDuration(sc.durationSec)}
                            </span>
                            <span className="text-[10px] text-gray-400 font-semibold">
                              {sc.turns ? `${sc.turns} turns` : 'Full session'}
                            </span>
                          </div>
                        </td>

                        {/* Tech Score */}
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center justify-center font-mono text-xs font-extrabold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                            {tech ? tech.score.toFixed(1) : '—'}
                          </span>
                        </td>

                        {/* Product Score */}
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center justify-center font-mono text-xs font-extrabold px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200">
                            {prod ? prod.score.toFixed(1) : '—'}
                          </span>
                        </td>

                        {/* HR Score */}
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center justify-center font-mono text-xs font-extrabold px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 border border-teal-200">
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
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#181A20] hover:bg-black text-white text-xs font-bold transition-all shadow-xs hover:shadow-md cursor-pointer active:scale-95"
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
