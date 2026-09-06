import { useState, useEffect } from 'react';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem('kyro_cookie_consent');
      if (!consent) {
        // Small delay for smooth entrance
        const timer = setTimeout(() => setVisible(true), 800);
        return () => clearTimeout(timer);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  function handleAccept() {
    try {
      localStorage.setItem('kyro_cookie_consent', 'all');
    } catch {}
    setVisible(false);
  }

  function handleEssentialOnly() {
    try {
      localStorage.setItem('kyro_cookie_consent', 'essential');
    } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside
      aria-label="Cookie and privacy preferences"
      className="fixed bottom-5 left-5 right-5 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="bg-white dark:bg-[#161920] border border-[#EBE6DF] dark:border-[#222631] rounded-2xl p-5 shadow-xl backdrop-blur-md">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-[#F4F1EA] dark:bg-[#1E232D] border border-[#E6DAC8] dark:border-[#2D333F] flex items-center justify-center text-base shrink-0">
            🍪
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-[#181A20] dark:text-[#F9FAFB]">
              We value your privacy
            </h3>
            <p className="mt-1 text-xs text-[#4B5565] dark:text-[#94A3B8] leading-relaxed">
              We use essential cookies and session tokens to manage your AI panel interviews and ensure secure recruiter access.
            </p>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-[#EBE6DF] dark:border-[#222631] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleEssentialOnly}
            className="px-3 py-1.5 rounded-lg border border-[#EBE6DF] dark:border-[#222631] text-xs font-semibold text-[#4B5565] dark:text-[#94A3B8] hover:bg-gray-50 dark:hover:bg-[#1E232D] transition-colors cursor-pointer"
          >
            Essential Only
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="px-4 py-1.5 rounded-lg bg-[#181A20] dark:bg-[#F9FAFB] text-white dark:text-[#0F1115] text-xs font-bold hover:bg-black dark:hover:bg-white transition-colors cursor-pointer shadow-2xs"
          >
            Accept All
          </button>
        </div>
      </div>
    </aside>
  );
}
