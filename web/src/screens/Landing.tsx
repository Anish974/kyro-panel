import { useState } from 'react';

interface Props {
  onCompany: () => void;
  onCandidate: () => void;
}

// Served from web/public
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

export default function Landing({ onCompany, onCandidate }: Props) {
  const [missing, setMissing] = useState<readonly string[]>([]);
  const shots = SHOTS.filter(s => !missing.includes(s.src));

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#181A20] flex flex-col selection:bg-gray-200">
      {/* Top Navigation Bar - Full Width with Left Aligned Brand */}
      <header className="w-full px-6 sm:px-10 lg:px-16 py-4 flex items-center justify-between border-b border-[#EBE6DF]/80 bg-[#FAF9F6]/90 backdrop-blur-md sticky top-0 z-30">
        <div 
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-3 cursor-pointer select-none group"
        >
          <img
            src="/favicon.png"
            alt="Kyro Panel Logo"
            className="w-9 h-9 sm:w-10 sm:h-10 object-contain transition-transform group-hover:scale-105"
          />
          <span className="font-display font-extrabold text-2xl tracking-tight text-[#181A20]">
            Kyro Panel
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onCandidate}
            className="hidden sm:inline-flex text-xs font-bold text-[#4B5565] hover:text-[#181A20] px-3 py-2 transition-colors cursor-pointer"
          >
            Candidate Practice
          </button>
          <button
            onClick={onCompany}
            className="h-10 px-5 rounded-xl border border-[#EBE6DF] bg-white font-bold text-xs sm:text-sm text-[#181A20] hover:bg-gray-50 shadow-2xs transition-all cursor-pointer"
          >
            For Hiring Teams
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1140px] w-full mx-auto px-6 py-12 flex flex-col gap-20">
        {/* Hero Section */}
        <section className="text-center pt-6 pb-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F4F1EA] border border-[#E6DAC8] text-xs font-bold text-[#78644E] mb-6">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Coordinated AI Voice Panel
          </div>

          <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.08] text-[#181A20] max-w-4xl mx-auto">
            Three AI interviewers.
            <br />
            <span className="bg-gradient-to-r from-[#181A20] via-[#3B4252] to-[#6366F1] bg-clip-text text-transparent">
              One voice call. Real deliberation.
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-xl text-[#4B5565] max-w-2xl mx-auto leading-relaxed">
            A <strong>Technical Architect</strong>, <strong>Product Manager</strong>, and <strong>Hiring Lead</strong> share 
            one real-time memory of your interview. They dynamically bid for who speaks next and deliver three independent verdicts —{' '}
            <strong className="text-[#181A20]">never averaged into a single opaque score.</strong>
          </p>

          <div className="mt-9 flex flex-col sm:flex-row gap-3.5 justify-center items-center">
            <button
              onClick={onCandidate}
              className="w-full sm:w-auto h-12 px-8 rounded-xl bg-[#181A20] text-white font-bold text-sm hover:bg-black transition-all cursor-pointer shadow-sm hover:shadow-md"
            >
              Start as Candidate
            </button>
            <button
              onClick={onCompany}
              className="w-full sm:w-auto h-12 px-8 rounded-xl bg-white border border-[#EBE6DF] font-bold text-sm text-[#181A20] hover:bg-gray-50 transition-all cursor-pointer shadow-2xs"
            >
              Recruiter & Company Portal
            </button>
          </div>

          <p className="mt-4 text-xs text-[#8C93A3]">
            Have an invite link from an employer? Open that link directly to access your scheduled interview.
          </p>
        </section>

        {/* Dual Audience Section: Built for Candidates & Hiring Teams */}
        <section className="flex flex-col gap-6">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[#181A20]">
              Built for both sides of the hiring table
            </h2>
            <p className="mt-2 text-sm text-[#4B5565]">
              Whether you are evaluating top candidates or preparing for high-stakes interviews.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mt-4">
            {/* For Candidates Card */}
            <div className="bg-white rounded-3xl border border-[#EBE6DF] p-8 sm:p-9 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-blue-50 text-[#2563EB] border border-blue-200/60 mb-5">
                  🎓 For Candidates & Job Seekers
                </div>
                <h3 className="font-display text-2xl font-extrabold text-[#181A20] leading-snug">
                  Practice high-pressure panel interviews with unvarnished feedback
                </h3>
                <p className="mt-3 text-sm text-[#4B5565] leading-relaxed">
                  No generic multiple-choice bots. Experience a dynamic multi-interviewer voice call that challenges both your technical architecture and product execution.
                </p>

                <ul className="mt-6 space-y-3.5 text-sm text-[#181A20]">
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-600 font-bold text-base leading-none">✓</span>
                    <span><strong>Live Voice Deliberation:</strong> Answer interviewers who follow up on your logic and take turns speaking.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-600 font-bold text-base leading-none">✓</span>
                    <span><strong>Multi-Angle Scorecards:</strong> See exactly where Technical, Product, and HR perspectives aligned or diverged.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-600 font-bold text-base leading-none">✓</span>
                    <span><strong>Timestamped Evidence:</strong> Review direct quotes from your responses that influenced each verdict.</span>
                  </li>
                </ul>
              </div>

              <div className="mt-8 pt-6 border-t border-[#EBE6DF]">
                <button
                  onClick={onCandidate}
                  className="w-full h-11 rounded-xl bg-[#FAF9F6] border border-[#EBE6DF] hover:bg-gray-100 font-bold text-sm text-[#181A20] transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Practice Mock Interview</span>
                  <span>→</span>
                </button>
              </div>
            </div>

            {/* For Hiring Teams Card */}
            <div className="bg-white rounded-3xl border border-[#EBE6DF] p-8 sm:p-9 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-purple-50 text-[#8B5CF6] border border-purple-200/60 mb-5">
                  💼 For Hiring Teams & Recruiters
                </div>
                <h3 className="font-display text-2xl font-extrabold text-[#181A20] leading-snug">
                  Comprehensive 3-way candidate evaluations in a single automated round
                </h3>
                <p className="mt-3 text-sm text-[#4B5565] leading-relaxed">
                  Screen candidates thoroughly on engineering depth, product acumen, and behavioral fit without tying up hours of senior staff time.
                </p>

                <ul className="mt-6 space-y-3.5 text-sm text-[#181A20]">
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-600 font-bold text-base leading-none">✓</span>
                    <span><strong>Instant Invite Generation:</strong> Paste role descriptions and target levels to generate candidate invite links.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-600 font-bold text-base leading-none">✓</span>
                    <span><strong>Floor Bidding Coordination:</strong> Panelists coordinate seamlessly on voice, avoiding repetitive questions.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-600 font-bold text-base leading-none">✓</span>
                    <span><strong>Un-Averaged Panel Verdicts:</strong> Identify specific trade-offs and debate points with transparent scorecard reports.</span>
                  </li>
                </ul>
              </div>

              <div className="mt-8 pt-6 border-t border-[#EBE6DF]">
                <button
                  onClick={onCompany}
                  className="w-full h-11 rounded-xl bg-[#181A20] hover:bg-black font-bold text-sm text-white transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                >
                  <span>Open Recruiter Portal</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Feature Cards */}
        <section className="flex flex-col gap-8 pb-4">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[#181A20]">
              How the Coordinated Panel works
            </h2>
            <p className="mt-2 text-sm text-[#4B5565]">
              Real-time voice intelligence powered by Agora and coordinated LLM agents.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-[#EBE6DF] p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#F4F1EA] border border-[#E6DAC8] flex items-center justify-center text-lg mb-4">
                  🎙️
                </div>
                <h4 className="font-bold text-base text-[#181A20]">Real-Time Floor Bidding</h4>
                <p className="mt-2 text-xs sm:text-sm text-[#4B5565] leading-relaxed">
                  After every answer, panelists score their desire to speak based on what was said. The highest bidder takes the floor naturally.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#EBE6DF] p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#F4F1EA] border border-[#E6DAC8] flex items-center justify-center text-lg mb-4">
                  🧠
                </div>
                <h4 className="font-bold text-base text-[#181A20]">Unified Shared Context</h4>
                <p className="mt-2 text-xs sm:text-sm text-[#4B5565] leading-relaxed">
                  All interviewers share one continuous memory. If the Technical Architect uncovers a weak spot, the PM follows up directly without asking you to repeat yourself.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#EBE6DF] p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#F4F1EA] border border-[#E6DAC8] flex items-center justify-center text-lg mb-4">
                  📊
                </div>
                <h4 className="font-bold text-base text-[#181A20]">3 Independent Verdicts</h4>
                <p className="mt-2 text-xs sm:text-sm text-[#4B5565] leading-relaxed">
                  We never blend verdicts into a single misleading average. You get individual appraisals quoting exact transcript lines with timestamps.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Screenshots Section (If available) */}
        {shots.length > 0 && (
          <section className="grid gap-8 sm:grid-cols-2 pb-6">
            {shots.map(shot => (
              <figure key={shot.src}>
                <img
                  src={shot.src}
                  alt={shot.title}
                  loading="lazy"
                  onError={() => setMissing(m => (m.includes(shot.src) ? m : [...m, shot.src]))}
                  className="w-full rounded-2xl border border-[#EBE6DF] shadow-sm bg-white"
                />
                <figcaption className="mt-3">
                  <span className="font-bold text-sm">{shot.title}</span>
                  <span className="block text-sm text-[#4B5565]">{shot.caption}</span>
                </figcaption>
              </figure>
            ))}
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#EBE6DF] py-8 text-center text-xs text-[#8C93A3] font-mono">
        Kyro Panel &nbsp;•&nbsp; Coordinated AI Voice Interview Panel &nbsp;•&nbsp; Powered by Agora RTC & RTM
      </footer>
    </div>
  );
}

