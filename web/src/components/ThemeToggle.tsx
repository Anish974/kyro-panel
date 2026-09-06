import { useEffect, useState } from 'react';

interface Props {
  className?: string;
  showLabel?: boolean;
}

export default function ThemeToggle({ className = '', showLabel = false }: Props) {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('kyro_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('kyro_theme', 'light');
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? 'Switch to Light mode (D)' : 'Switch to Dark mode (D)'}
      aria-label="Toggle theme"
      className={`relative inline-flex items-center justify-center h-10 px-3 rounded-xl border border-[#EBE6DF] dark:border-[#222631] bg-white dark:bg-[#161920] text-[#4B5565] dark:text-[#94A3B8] hover:text-[#181A20] dark:hover:text-[#F9FAFB] hover:bg-gray-50 dark:hover:bg-[#1E232D] shadow-2xs transition-all cursor-pointer select-none group ${className}`}
    >
      <div className="relative w-5 h-5 flex items-center justify-center">
        {/* Sun Icon */}
        <svg
          className={`w-4 h-4 transition-all duration-300 transform ${
            isDark ? 'rotate-90 scale-0 opacity-0 absolute' : 'rotate-0 scale-100 opacity-100'
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>

        {/* Moon Icon */}
        <svg
          className={`w-4 h-4 transition-all duration-300 transform ${
            isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0 absolute'
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      </div>

      {showLabel && (
        <span className="ml-2 text-xs font-bold">
          {isDark ? 'Dark' : 'Light'}
        </span>
      )}
    </button>
  );
}
