import { useEffect } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  key: string;
  desc: string;
}

const SHORTCUTS: ShortcutItem[] = [
  { key: 'D', desc: 'Toggle Dark / Light Mode' },
  { key: 'C', desc: 'Go to Candidate Practice' },
  { key: 'H', desc: 'Go to Hiring / Recruiter Portal' },
  { key: 'T', desc: 'Scroll Back to Top' },
  { key: '?', desc: 'Open / Close Shortcuts Help' },
  { key: 'Esc', desc: 'Close Modals or Dialogs' },
];

export default function ShortcutsModal({ isOpen, onClose }: Props) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-[#161920] rounded-3xl border border-[#EBE6DF] dark:border-[#222631] shadow-2xl p-6 sm:p-7 select-none animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#EBE6DF] dark:border-[#222631]">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#F4F1EA] dark:bg-[#1E232D] border border-[#E6DAC8] dark:border-[#2D333F] flex items-center justify-center text-sm">
              ⌨️
            </span>
            <h2 id="shortcuts-title" className="font-display text-lg font-extrabold text-[#181A20] dark:text-[#F9FAFB]">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex items-center justify-center text-sm hover:bg-gray-100 dark:hover:bg-[#1E232D] transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-2.5">
          {SHORTCUTS.map(s => (
            <div
              key={s.key}
              className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-[#FAF9F6] dark:hover:bg-[#1A1F29] transition-colors"
            >
              <span className="text-xs sm:text-sm text-[#4B5565] dark:text-[#94A3B8]">
                {s.desc}
              </span>
              <kbd className="px-2.5 py-1 rounded-lg bg-[#F4F1EA] dark:bg-[#222631] border border-[#E6DAC8] dark:border-[#2D333F] font-mono text-xs font-bold text-[#181A20] dark:text-[#F9FAFB] shadow-2xs">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-[#EBE6DF] dark:border-[#222631] text-center">
          <p className="text-[11px] text-[#8C93A3] font-mono">
            Press <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border text-[10px]">?</kbd> anywhere to view this cheat sheet.
          </p>
        </div>
      </div>
    </div>
  );
}
