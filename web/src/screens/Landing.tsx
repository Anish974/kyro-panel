import { useState } from 'react';
import ThemeToggle from '../components/ThemeToggle.js';
import BackToTop from '../components/BackToTop.js';

interface Props {
  onCompany: () => void;
  onCandidate: () => void;
}

const SHOTS = [
  {
    src: '/screenshots/room.png',
    title: 'The Room',
    caption: 'Three coordinated AI interviewers, live transcription, and dynamic floor bidding.',
  },
  {
    src: '/screenshots/scorecard.png',
    title: 'The Scorecard',
    caption: 'Three separate verdicts with exact timestamped quotes — never averaged.',
  },
] as const;

interface FAQItem {
  q: string;
  a: string;
}

const FAQS: FAQItem[] = [
  {
    q: 'How does the 3-interviewer AI panel coordinate without interrupting each other?',
    a: 'After each answer you give, our backend runs a real-time floor-bidding algorithm. Each panelist (Technical Architect, Product Manager, and Hiring Lead) evaluates your response and submits an urgency score. The highest bidder takes the floor via synchronized Agora audio streams, ensuring natural conversation without awkward collisions.',
  },
  {
    q: 'What does "never averaged into a single score" mean?',
    a: 'Traditional automated tools reduce complex interviews into an arbitrary number like 7.5/10. Kyro Panel generates three separate, unvarnished verdicts from each persona—with direct timestamped quotes from your transcript. When panelists disagree on your approach, that disagreement is clearly visible and valuable.',
  },
  {
    q: 'Do I need to install software or enable my camera?',
    a: 'No installation required! Kyro Panel runs directly in modern web browsers with ultra-low latency voice powered by Agora. The interview is voice-first, meaning you only need a functioning microphone.',
  },
  {
    q: 'How do hiring teams customize the panel for specific jobs?',
    a: 'Recruiters can generate tailored invite links in seconds by entering the job description, target seniority level (Intern to Expert), and optionally uploading the candidate\'s resume. The AI panel adapts its inquiry directly around those specific requirements.',
  },
  {
    q: 'Can candidates practice without a company invitation?',
    a: 'Yes. Candidates can start an instant Mock Interview anytime. You will get the full 3-person panel experience and receive a comprehensive un-averaged scorecard at the end.',
  },
];

export default function Landing({ onCompany, onCandidate }: Props) {
  const [missing, setMissing] = useState<readonly string[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const shots = SHOTS.filter(s => !missing.includes(s.src));

  function toggleFaq(index: number) {
    setOpenFaq(prev => (prev === index ? null : index));
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-[#0F1115] text-gray-900 dark:text-white flex flex-col selection:bg-gray-200 dark:selection:bg-gray-800 transition-colors duration-200">
      {/* Top Navigation Bar */}
      <header className="w-full px-6 sm:px-10 lg:px-16 py-4 flex items-center justify-between border-b border-[#EBE6DF]/80 dark:border-[#222631]/80 bg-[#FAF9F6]/90 dark:bg-[#0F1115]/90 backdrop-blur-md sticky top-0 z-30">
        <div
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-3.5 cursor-pointer select-none group"
        >
          <img
            src="/favicon.png"
            alt="Kyro Panel Logo"
            className="w-10 h-10 md:w-12 md:h-12 object-contain transition-transform group-hover:scale-105 drop-shadow-xs"
          />
          <span className="font-display font-extrabold text-2xl sm:text-3xl tracking-tight text-gray-950 dark:text-white">
            Kyro Panel
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            onClick={onCandidate}
            className="hidden sm:inline-flex text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-gray-950 dark:hover:text-white px-3 py-2 transition-colors cursor-pointer"
          >
            Candidate Practice
          </button>
          <button
            onClick={onCompany}
            className="h-10 px-5 rounded-xl border border-[#EBE6DF] dark:border-[#222631] bg-white dark:bg-[#161920] font-bold text-xs sm:text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-[#1E232D] shadow-2xs transition-all cursor-pointer"
          >
            For Hiring Teams
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1140px] w-full mx-auto px-6 py-12 flex flex-col gap-20">
        {/* Hero Section */}
        <section className="text-center pt-8 pb-4">
          <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.08] text-gray-950 dark:text-white max-w-4xl mx-auto">
            Three AI interviewers.
            <br />
            <span className="bg-gradient-to-r from-gray-900 via-gray-700 to-indigo-600 dark:from-white dark:via-gray-200 dark:to-indigo-400 bg-clip-text text-transparent">
              One voice call. Real deliberation.
            </span>
          </h1>

          <div className="mt-8 flex flex-col sm:flex-row gap-3.5 justify-center items-center">
            <button
              onClick={onCandidate}
              className="w-full sm:w-auto h-12 px-8 rounded-xl bg-[#181A20] dark:bg-white text-white dark:text-[#0F1115] font-bold text-sm hover:bg-black dark:hover:bg-gray-100 transition-all cursor-pointer shadow-sm hover:shadow-md"
            >
              Start as Candidate
            </button>
            <button
              onClick={onCompany}
              className="w-full sm:w-auto h-12 px-8 rounded-xl bg-white dark:bg-[#161920] border border-[#EBE6DF] dark:border-[#222631] font-bold text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-[#1E232D] transition-all cursor-pointer shadow-2xs"
            >
              Recruiter &amp; Company Portal
            </button>
          </div>

          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            Have an invite link from an employer? Open that link directly to access your scheduled interview.
          </p>
        </section>

        {/* Dual Audience Section: Built for Candidates & Hiring Teams */}
        <section className="flex flex-col gap-6">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-gray-950 dark:text-white">
              Built for both sides of the hiring table
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Whether you are evaluating top candidates or preparing for high-stakes interviews.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mt-4">
            {/* For Candidates Card */}
            <div className="bg-white dark:bg-[#161920] rounded-3xl border border-[#EBE6DF] dark:border-[#222631] p-8 sm:p-9 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-950/50 text-[#2563EB] dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 mb-5">
                  Candidate
                </div>
                <h3 className="font-display text-2xl font-extrabold text-gray-950 dark:text-white leading-snug">
                  Practice high-pressure panel interviews with unvarnished feedback
                </h3>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  No generic multiple-choice bots. Experience a dynamic multi-interviewer voice call that challenges both your technical architecture and product execution.
                </p>

                <ul className="mt-6 space-y-3.5 text-sm text-gray-900 dark:text-gray-200">
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold text-base leading-none">✓</span>
                    <span><strong>Live Voice Deliberation:</strong> Answer interviewers who follow up on your logic and take turns speaking.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold text-base leading-none">✓</span>
                    <span><strong>Multi-Angle Scorecards:</strong> See exactly where Technical, Product, and HR perspectives aligned or diverged.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold text-base leading-none">✓</span>
                    <span><strong>Timestamped Evidence:</strong> Review direct quotes from your responses that influenced each verdict.</span>
                  </li>
                </ul>
              </div>

              <div className="mt-8 pt-6 border-t border-[#EBE6DF] dark:border-[#222631]">
                <button
                  onClick={onCandidate}
                  className="w-full h-11 rounded-xl bg-[#FAF9F6] dark:bg-[#1E232D] border border-[#EBE6DF] dark:border-[#2D333F] hover:bg-gray-100 dark:hover:bg-[#252B38] font-bold text-sm text-gray-900 dark:text-white transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Practice Mock Interview</span>
                  <span>&rarr;</span>
                </button>
              </div>
            </div>

            {/* For Hiring Teams Card */}
            <div className="bg-white dark:bg-[#161920] rounded-3xl border border-[#EBE6DF] dark:border-[#222631] p-8 sm:p-9 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-purple-50 dark:bg-purple-950/50 text-[#8B5CF6] dark:text-purple-400 border border-purple-200/60 dark:border-purple-800/60 mb-5">
                  For Hiring Teams
                </div>
                <h3 className="font-display text-2xl font-extrabold text-gray-950 dark:text-white leading-snug">
                  Comprehensive 3-way candidate evaluations in a single automated round
                </h3>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  Screen candidates thoroughly on engineering depth, product acumen, and behavioral fit without tying up hours of senior staff time.
                </p>

                <ul className="mt-6 space-y-3.5 text-sm text-gray-900 dark:text-gray-200">
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold text-base leading-none">✓</span>
                    <span><strong>Instant Invite Generation:</strong> Paste role descriptions and target levels to generate candidate invite links.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold text-base leading-none">✓</span>
                    <span><strong>Floor Bidding Coordination:</strong> Panelists coordinate seamlessly on voice, avoiding repetitive questions.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold text-base leading-none">✓</span>
                    <span><strong>Un-Averaged Panel Verdicts:</strong> Identify specific trade-offs and debate points with transparent scorecard reports.</span>
                  </li>
                </ul>
              </div>

              <div className="mt-8 pt-6 border-t border-[#EBE6DF] dark:border-[#222631]">
                <button
                  onClick={onCompany}
                  className="w-full h-11 rounded-xl bg-[#181A20] dark:bg-white hover:bg-black dark:hover:bg-gray-100 font-bold text-sm text-white dark:text-[#0F1115] transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                >
                  <span>Open Recruiter Portal</span>
                  <span>&rarr;</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Feature Cards */}
        <section className="flex flex-col gap-8">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-gray-950 dark:text-white">
              How the Coordinated Panel works
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Real-time voice intelligence powered by Agora and coordinated LLM agents.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-[#161920] rounded-2xl border border-[#EBE6DF] dark:border-[#222631] p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#F4F1EA] dark:bg-[#1E232D] border border-[#E6DAC8] dark:border-[#2D333F] flex items-center justify-center text-lg mb-4">
                  🎙️
                </div>
                <h3 className="font-bold text-base text-gray-950 dark:text-white">Real-Time Floor Bidding</h3>
                <p className="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  After every answer, panelists score their desire to speak based on what was said. The highest bidder takes the floor naturally.
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-[#161920] rounded-2xl border border-[#EBE6DF] dark:border-[#222631] p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#F4F1EA] dark:bg-[#1E232D] border border-[#E6DAC8] dark:border-[#2D333F] flex items-center justify-center text-lg mb-4">
                  🧠
                </div>
                <h3 className="font-bold text-base text-gray-950 dark:text-white">Unified Shared Context</h3>
                <p className="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  All interviewers share one continuous memory. If the Technical Architect uncovers a weak spot, the PM follows up directly without asking you to repeat yourself.
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-[#161920] rounded-2xl border border-[#EBE6DF] dark:border-[#222631] p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#F4F1EA] dark:bg-[#1E232D] border border-[#E6DAC8] dark:border-[#2D333F] flex items-center justify-center text-lg mb-4">
                  📊
                </div>
                <h3 className="font-bold text-base text-gray-950 dark:text-white">3 Independent Verdicts</h3>
                <p className="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  We never blend verdicts into a single misleading average. You get individual appraisals quoting exact transcript lines with timestamps.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Screenshots Section (If available) */}
        {shots.length > 0 && (
          <section className="grid gap-8 sm:grid-cols-2">
            {shots.map(shot => (
              <figure key={shot.src}>
                <img
                  src={shot.src}
                  alt={shot.title}
                  loading="lazy"
                  onError={() => setMissing(m => (m.includes(shot.src) ? m : [...m, shot.src]))}
                  className="w-full rounded-2xl border border-[#EBE6DF] dark:border-[#222631] shadow-sm bg-white dark:bg-[#161920]"
                />
                <figcaption className="mt-3">
                  <span className="font-bold text-sm text-gray-950 dark:text-white">{shot.title}</span>
                  <span className="block text-sm text-gray-600 dark:text-gray-400">{shot.caption}</span>
                </figcaption>
              </figure>
            ))}
          </section>
        )}

        {/* Expandable FAQs Section - At the bottom with divider */}
        <section className="flex flex-col gap-6 pt-10 border-t border-[#EBE6DF]/80 dark:border-[#222631]/80 pb-6">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-gray-950 dark:text-white">
              Frequently Asked Questions
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Everything you need to know about the coordinated AI panel.
            </p>
          </div>

          <div className="max-w-3xl w-full mx-auto space-y-3 mt-4">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className="bg-white dark:bg-[#161920] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden transition-all shadow-xs"
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(idx)}
                    className="w-full px-6 py-4.5 text-left flex items-center justify-between gap-4 font-bold text-sm sm:text-base text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-[#1E232D] transition-colors cursor-pointer"
                  >
                    <span className="text-gray-900 dark:text-white">{faq.q}</span>
                    <span className={`text-sm font-mono text-gray-500 dark:text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 pt-1 text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed border-t border-gray-100 dark:border-gray-800 animate-in fade-in duration-200">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#EBE6DF] dark:border-[#222631] py-8 px-6 text-center text-xs text-gray-500 dark:text-gray-400 font-mono">
        <div className="max-w-[1140px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>Kyro Panel &bull; Coordinated AI Voice Interview Panel</span>
          <span>Powered by Agora RTC &amp; RTM &bull; Press <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border text-[10px]">?</kbd> for shortcuts</span>
        </div>
      </footer>

      {/* Back to Top Floating Button */}
      <BackToTop />
    </div>
  );
}
