import ThemeToggle from '../components/ThemeToggle.js';

interface Props {
  onHome: () => void;
  onCandidate: () => void;
  onCompany: () => void;
  message?: string;
}

export default function NotFound({
  onHome,
  onCandidate,
  onCompany,
  message = 'The page or interview link you were looking for does not exist or has expired.',
}: Props) {
  return (
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-[#0F1115] text-[#181A20] dark:text-[#F9FAFB] flex flex-col justify-between selection:bg-gray-200 dark:selection:bg-gray-800">
      {/* Header */}
      <header className="w-full px-6 sm:px-10 lg:px-16 py-5 flex items-center justify-between border-b border-[#EBE6DF]/80 dark:border-[#222631]/80 bg-[#FAF9F6]/90 dark:bg-[#0F1115]/90 backdrop-blur-md sticky top-0 z-30">
        <div
          onClick={onHome}
          className="flex items-center gap-3.5 cursor-pointer select-none group"
        >
          <img
            src="/favicon.png"
            alt="Kyro Panel Logo"
            className="w-10 h-10 object-contain transition-transform group-hover:scale-105 drop-shadow-xs"
          />
          <span className="font-display font-extrabold text-2xl tracking-tight text-[#181A20] dark:text-[#F9FAFB]">
            Kyro Panel
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            onClick={onHome}
            className="h-10 px-5 rounded-xl border border-[#EBE6DF] dark:border-[#222631] bg-white dark:bg-[#161920] font-bold text-xs sm:text-sm text-[#181A20] dark:text-[#F9FAFB] hover:bg-gray-50 dark:hover:bg-[#1E232D] shadow-2xs transition-all cursor-pointer"
          >
            Home
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center max-w-lg mx-auto select-none">
        <div className="w-20 h-20 rounded-3xl bg-[#F4F1EA] dark:bg-[#1E232D] border border-[#E6DAC8] dark:border-[#2D333F] flex items-center justify-center text-4xl mb-6 shadow-xs">
          🧭
        </div>

        <span className="font-mono text-xs font-extrabold tracking-widest text-indigo-600 dark:text-indigo-400 uppercase">
          404 &bull; Page Not Found
        </span>

        <h1 className="mt-3 font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-[#181A20] dark:text-[#F9FAFB]">
          Lost in the panel?
        </h1>

        <p className="mt-3 text-sm text-[#4B5565] dark:text-[#94A3B8] leading-relaxed">
          {message}
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full justify-center">
          <button
            onClick={onHome}
            className="h-11 px-6 rounded-xl bg-[#181A20] dark:bg-[#F9FAFB] text-white dark:text-[#0F1115] font-bold text-sm hover:bg-black dark:hover:bg-white transition-all cursor-pointer shadow-2xs"
          >
            Return to Homepage
          </button>
          <button
            onClick={onCandidate}
            className="h-11 px-6 rounded-xl bg-white dark:bg-[#161920] border border-[#EBE6DF] dark:border-[#222631] font-bold text-sm text-[#181A20] dark:text-[#F9FAFB] hover:bg-gray-50 dark:hover:bg-[#1E232D] transition-all cursor-pointer shadow-2xs"
          >
            Candidate Practice
          </button>
          <button
            onClick={onCompany}
            className="h-11 px-6 rounded-xl bg-white dark:bg-[#161920] border border-[#EBE6DF] dark:border-[#222631] font-bold text-sm text-[#181A20] dark:text-[#F9FAFB] hover:bg-gray-50 dark:hover:bg-[#1E232D] transition-all cursor-pointer shadow-2xs"
          >
            Recruiter Portal
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#EBE6DF] dark:border-[#222631] py-6 text-center text-xs text-[#8C93A3] font-mono">
        Kyro Panel &nbsp;•&nbsp; Coordinated AI Voice Interview Panel
      </footer>
    </div>
  );
}
