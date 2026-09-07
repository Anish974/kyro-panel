import { useRef, useState } from 'react';
import { PROFILE_LIMITS, type Duration, type Interview } from '@kyro/shared';
import { RESUME_ACCEPT, extractResumeText } from '../lib/resume.js';
import ThemeToggle from '../components/ThemeToggle.js';

export interface Candidate {
  name: string;
  role: string;
  level: string;
  /**
   * How long the company booked the interview for. Comes off the invite and is
   * posted with the profile, the same route role and level already take — it is
   * what paces the panel, so the server has to be told before the agent joins.
   */
  durationMin: Duration;
  /** Plain text pulled out of the uploaded resume, if one was attached. */
  resumeText?: string;
}

interface Props {
  /** The interview the company scheduled. Its role and level are the bar. */
  invite: Interview;
  onLogin: (candidate: Candidate) => void;
  onBack?: () => void;
}

export default function Login({ invite, onLogin, onBack }: Props) {
  // Prefilled, not locked: the company typed this name and may have spelled it
  // wrong, and the panel says it out loud all interview. Role and level are a
  // different matter — those are the bar, and they are not the candidate's to
  // move. See server/src/panel/interviews.ts.
  const [name, setName] = useState(invite.candidateName);
  const [error, setError] = useState('');

  // Resume is optional, so its failures are shown next to the field and never
  // block sign-in — a candidate whose PDF will not parse still gets interviewed.
  const [resumeName, setResumeName] = useState<string | null>(null);
  const [resumeText, setResumeText] = useState('');
  const [resumeError, setResumeError] = useState('');
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setResumeError('');
    setReading(true);
    try {
      const text = await extractResumeText(file);
      setResumeText(text);
      setResumeName(file.name);
    } catch (err) {
      setResumeText('');
      setResumeName(null);
      setResumeError((err as Error).message);
    } finally {
      setReading(false);
    }
  }

  function clearResume() {
    setResumeText('');
    setResumeName(null);
    setResumeError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function enterRoom(candidate: Candidate) {
    setSubmitting(true);
    try {
      const res = await fetch('/candidate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(candidate),
      });
      if (!res.ok) throw new Error(`server answered ${res.status}`);
    } catch (err) {
      console.warn('Could not send the profile to the panel:', err);
      setError('Panel server unreachable — entering the room, but the panel will not know your name.');
    } finally {
      setSubmitting(false);
    }
    onLogin(candidate);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your full name — the panel addresses you by it');
      return;
    }
    setError('');
    void enterRoom({
      name: name.trim(),
      role: invite.role,
      level: invite.level,
      durationMin: invite.durationMin,
      ...(resumeText ? { resumeText } : {}),
    });
  };

  return (
    <div className="min-h-screen w-full bg-[#FAF9F6] dark:bg-[#0F1115] text-[#181A20] dark:text-[#F9FAFB] flex flex-col justify-center items-center px-4 py-12 select-none relative transition-colors duration-200">
      {/* Top Header Controls */}
      <div className="w-full max-w-md mb-6 flex items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#EBE6DF] dark:border-[#2D333F] bg-white dark:bg-[#161920] hover:bg-gray-50 dark:hover:bg-[#1E232D] text-xs font-bold text-[#4B5565] dark:text-[#94A3B8] hover:text-[#181A20] dark:hover:text-white transition-all shadow-2xs cursor-pointer active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Home</span>
          </button>
        ) : <div />}
        <ThemeToggle />
      </div>

      {/* Top Brand Tag / Logo */}
      <div className="w-full max-w-md mb-8 text-center flex flex-col items-center">
        <div className="w-14 h-14 rounded-2xl bg-white dark:bg-[#1E232D] border border-[#EBE6DF] dark:border-[#2D333F] flex items-center justify-center shadow-xs overflow-hidden p-2 mb-3">
          <img src="/favicon.png" alt="Kyro Panel Logo" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#181A20] dark:text-[#F9FAFB] font-display">
          Kyro Panel
        </h1>
        <p className="mt-2 text-sm sm:text-base text-[#4B5565] dark:text-[#94A3B8] font-sans">
          Confirm your name and enter the room — the panel is waiting
        </p>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md bg-white dark:bg-[#161920] rounded-3xl border border-[#EBE6DF] dark:border-[#222631] shadow-xs p-8 sm:p-10">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 text-sm text-[#EF4444] bg-[#FEF2F2] dark:bg-red-950/40 border border-[#FEE2E2] dark:border-red-800/40 rounded-xl flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] dark:text-[#94A3B8] mb-2 font-mono">
              Full Name
            </label>
            <div className="relative">
              <input
                id="name"
                type="text"
                required
                maxLength={PROFILE_LIMITS.name}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name, as the panel should say it"
                className="w-full px-4 py-3 rounded-xl bg-[#FAF9F6] dark:bg-[#1E232D] border border-[#EBE6DF] dark:border-[#2D333F] text-[#181A20] dark:text-[#F9FAFB] placeholder-[#8C93A3] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all font-semibold"
                autoFocus
              />
              <div className="absolute right-3.5 top-3.5 text-[#8C93A3] pointer-events-none">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#EBE6DF] dark:border-[#2D333F] bg-[#FAF9F6] dark:bg-[#1E232D] p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#4B5565] dark:text-[#94A3B8] font-mono">
                Scheduled For You
              </span>
              <span className="text-[11px] text-[#2563EB] dark:text-blue-400 font-mono font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                {invite.code}
              </span>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[#64748B] dark:text-[#94A3B8]">Role</dt>
                <dd className="font-bold text-[#181A20] dark:text-white text-right">{invite.role}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[#64748B] dark:text-[#94A3B8]">Level</dt>
                <dd className="font-bold text-[#181A20] dark:text-white text-right">{invite.level}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              Set by the hiring team. The panel calibrates its questions to this tier.
            </p>
          </div>

          {/* Resume — optional */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="resume" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] dark:text-[#94A3B8] font-mono">
                Resume
              </label>
              <span className="text-[11px] text-[#8C93A3] font-medium">Optional</span>
            </div>

            <input
              ref={fileRef}
              id="resume"
              type="file"
              accept={RESUME_ACCEPT}
              className="sr-only"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />

            {resumeName ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#F0FDF4] dark:bg-emerald-950/40 border border-[#BBF7D0] dark:border-emerald-800/40">
                <svg className="w-5 h-5 shrink-0 text-[#059669] dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#181A20] dark:text-white truncate">{resumeName}</p>
                  <p className="text-xs text-[#4B5565] dark:text-gray-400">
                    {resumeText.length.toLocaleString()} characters — the panel will ask about this
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearResume}
                  className="text-xs font-semibold text-[#4B5565] dark:text-gray-400 hover:text-[#EF4444] dark:hover:text-red-400 transition-colors cursor-pointer shrink-0"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={reading}
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#FAF9F6] dark:bg-[#1E232D] border border-dashed border-[#D9D2C7] dark:border-[#2D333F] text-left hover:border-[#2563EB] dark:hover:border-blue-500 hover:bg-[#F5F8FF] dark:hover:bg-blue-950/20 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
              >
                <svg className="w-5 h-5 shrink-0 text-[#8C93A3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                </svg>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#181A20] dark:text-gray-200">
                    {reading ? 'Reading your resume…' : 'Attach a resume (PDF, TXT or MD)'}
                  </p>
                  <p className="text-xs text-[#8C93A3] dark:text-gray-400">
                    Read in your browser — the file itself is never uploaded
                  </p>
                </div>
              </button>
            )}

            {resumeError && (
              <p className="mt-2 text-xs text-[#EF4444] font-medium">{resumeError}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || reading}
            className="w-full py-3.5 px-4 bg-[#181A20] dark:bg-[#F9FAFB] hover:bg-[#2A2E37] dark:hover:bg-white text-white dark:text-[#0F1115] font-bold rounded-xl transition-all duration-150 flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-wait active:scale-95"
          >
            <span>{submitting ? 'Briefing the panel…' : 'Sign In'}</span>
            {!submitting && (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            )}
          </button>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-full py-2 text-xs font-semibold text-[#64748B] dark:text-[#94A3B8] hover:text-[#181A20] dark:hover:text-white transition-colors cursor-pointer text-center"
            >
              Cancel &amp; Go Back
            </button>
          )}
        </form>
      </div>

      {/* Footer minimal info */}
      <div className="mt-8 text-center text-xs text-[#8C93A3] font-mono">
        Kyro Panel &bull; Technical, Product &amp; HR AI Assessment
      </div>
    </div>
  );
}
