import { useEffect, useState } from 'react';
import { PANEL } from '@kyro/shared';

interface Props {
  candidateName: string;
  role: string;
}

const STEP_MS = 1100;

const STEPS = [
  'Reading back the transcript',
  'Checking claims against what was actually said',
  'Writing three independent verdicts',
  'Comparing where the panel disagrees',
];

export default function Deliberating({ candidateName, role }: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= STEPS.length - 1) return;
    const id = setTimeout(() => setStep(s => s + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [step]);

  return (
    <div className="min-h-screen w-full bg-[#FAF9F6] dark:bg-[#0F1115] text-[#181A20] dark:text-[#F9FAFB] flex flex-col items-center justify-center px-4 py-12 select-none transition-colors duration-200">
      <div className="w-full max-w-lg flex flex-col items-center text-center gap-8">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-[#4B5565] dark:text-[#94A3B8] mb-3">
            Interview complete
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#181A20] dark:text-[#F9FAFB] font-display">
            The panel is writing up
          </h1>
          <p className="mt-3 text-base text-[#4B5565] dark:text-[#94A3B8]">
            {candidateName} &middot; {role}
          </p>
        </div>

        {/* The three of them, deliberating separately */}
        <div className="flex items-center justify-center gap-5">
          {PANEL.map((p, i) => (
            <div key={p.id} className="flex flex-col items-center gap-2.5">
              <div
                className="w-14 h-14 rounded-2xl grid place-items-center font-display font-extrabold text-lg text-white shadow-sm"
                style={{
                  backgroundColor: p.color,
                  animation: `pulse 1.6s ease-in-out ${i * 0.25}s infinite`,
                }}
              >
                {p.name.split(' ').map(n => n[0]).join('')}
              </div>
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{p.name.split(' ')[0]}</span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium leading-tight max-w-[80px]">
                {p.role}
              </span>
            </div>
          ))}
        </div>

        <div className="w-full bg-white dark:bg-[#161920] rounded-2xl border border-[#EBE6DF] dark:border-[#222631] shadow-sm p-6 flex flex-col gap-3">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-3 text-sm">
              {i < step ? (
                <span className="w-5 h-5 shrink-0 rounded-full bg-emerald-500 text-white grid place-items-center">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              ) : i === step ? (
                <span className="w-5 h-5 shrink-0 rounded-full border-2 border-[#2563EB] border-t-transparent animate-spin" />
              ) : (
                <span className="w-5 h-5 shrink-0 rounded-full border-2 border-[#EBE6DF] dark:border-[#2D333F]" />
              )}
              <span className={i <= step ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-600'}>
                {label}
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs text-[#8C93A3] dark:text-[#64748B] max-w-sm leading-relaxed">
          The three verdicts are never averaged. Where they disagree, you will see both sides
          and the answers each of them is standing on.
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.55; transform: scale(0.94); }
        }
      `}</style>
    </div>
  );
}
