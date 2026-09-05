import { useEffect, useState } from 'react';
import { PANEL } from '@kyro/shared';

// The gap between "end interview" and the scorecard used to be nothing: the
// screen swapped and three finished verdicts were simply there, which read as
// if they had been decided in advance.
//
// They are not. The three write-ups are produced here, from the transcript,
// after the interview ends. This screen is the honest version of that wait —
// it says what is happening while it happens, and it is the only moment in the
// product where the panel is visibly doing the thing the pitch is about.

interface Props {
  candidateName: string;
  role: string;
}

/** Roughly how long the write-up takes; the last line simply holds. */
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
    // Stops at the last step rather than looping — a spinner that restarts
    // suggests something went wrong.
    if (step >= STEPS.length - 1) return;
    const id = setTimeout(() => setStep(s => s + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [step]);

  return (
    <div className="min-h-screen w-full bg-[#FAF9F6] flex flex-col items-center justify-center px-4 py-12 select-none">
      <div className="w-full max-w-lg flex flex-col items-center text-center gap-8">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-[#4B5565] mb-3">
            Interview complete
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#181A20] font-display">
            The panel is writing up
          </h1>
          <p className="mt-3 text-base text-[#4B5565]">
            {candidateName} &middot; {role}
          </p>
        </div>

        {/* The three of them, deliberating separately — which is the whole
            point of the product, so it is worth showing rather than a spinner. */}
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
              <span className="text-xs font-bold text-gray-800">{p.name.split(' ')[0]}</span>
              <span className="text-[10px] text-gray-500 font-medium leading-tight max-w-[80px]">
                {p.role}
              </span>
            </div>
          ))}
        </div>

        <div className="w-full bg-white rounded-2xl border border-[#EBE6DF] shadow-sm p-6 flex flex-col gap-3">
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
                <span className="w-5 h-5 shrink-0 rounded-full border-2 border-[#EBE6DF]" />
              )}
              <span className={i <= step ? 'font-semibold text-gray-900' : 'text-gray-400'}>
                {label}
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs text-[#8C93A3] max-w-sm leading-relaxed">
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
