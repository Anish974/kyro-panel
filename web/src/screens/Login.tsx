import { useRef, useState } from 'react';
import { EXPERIENCE_LEVELS, PROFILE_LIMITS, type ExperienceLevel } from '@kyro/shared';
import { RESUME_ACCEPT, extractResumeText } from '../lib/resume.js';

export interface Candidate {
  name: string;
  role: string;
  level: string;
  /** Plain text pulled out of the uploaded resume, if one was attached. */
  resumeText?: string;
}

interface Props {
  onLogin: (candidate: Candidate) => void;
  onOpenCompany: () => void;
}

/**
 * The panel grades system design, trade-offs, customer impact, communication
 * and ownership, so every role here is one those five actually apply to.
 * OTHER_ROLE is the escape hatch: the list is a shortcut, not a whitelist.
 */
const ROLES = [
  'Senior Backend Engineer',
  'Backend Engineer',
  'Full-Stack Engineer',
  'Frontend Engineer',
  'Platform / Infrastructure Engineer',
  'Data Engineer',
  'Engineering Manager',
] as const;

const OTHER_ROLE = 'Other — type it in';

export default function Login({ onLogin, onOpenCompany }: Props) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>(ROLES[0]);
  const [level, setLevel] = useState<ExperienceLevel>('Intermediate (2-6 years)');
  const [customRole, setCustomRole] = useState('');
  const [error, setError] = useState('');

  // Resume is optional, so its failures are shown next to the field and never
  // block sign-in — a candidate whose PDF will not parse still gets interviewed.
  const [resumeName, setResumeName] = useState<string | null>(null);
  const [resumeText, setResumeText] = useState('');
  const [resumeError, setResumeError] = useState('');
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);

  const effectiveRole = role === OTHER_ROLE ? customRole.trim() : role;

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
    if (!effectiveRole) {
      setError('Please type the role you are interviewing for');
      return;
    }
    setError('');
    void enterRoom({
      name: name.trim(),
      role: effectiveRole,
      level,
      ...(resumeText ? { resumeText } : {}),
    });
  };

  return (
    <div className="min-h-screen w-full bg-[#FAF9F6] flex flex-col justify-center items-center px-4 py-12 select-none relative">
      {/* Top Right: Login as Company Portal */}
      <div className="absolute top-6 right-6 sm:top-8 sm:right-8 z-10">
        <button
          type="button"
          onClick={onOpenCompany}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-gray-50 text-gray-800 hover:text-gray-950 font-bold text-xs sm:text-sm border border-[#EBE6DF] shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="w-6 h-6 rounded-lg bg-blue-50 text-[#2563EB] grid place-items-center group-hover:bg-[#2563EB] group-hover:text-white transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <span>Login as Company</span>
          <svg className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Top Brand Tag / Logo */}
      <div className="w-full max-w-md mb-8 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#181A20] font-display">
          Kyro Panel
        </h1>
        <p className="mt-2 text-base text-[#4B5565] font-sans">
          Tell us who you are and select your experience level, then enter the room
        </p>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md bg-[#FFFFFF] rounded-2xl border border-[#EBE6DF] shadow-sm p-8 sm:p-10">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 text-sm text-[#EF4444] bg-[#FEF2F2] border border-[#FEE2E2] rounded-xl flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] mb-2 font-mono">
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
                className="w-full px-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#EBE6DF] text-[#181A20] placeholder-[#8C93A3] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all"
                autoFocus
              />
              <div className="absolute right-3.5 top-3.5 text-[#8C93A3] pointer-events-none">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="role" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] mb-2 font-mono">
              Interviewing For
            </label>
            <div className="relative">
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full appearance-none px-4 py-3 pr-11 rounded-xl bg-[#FAF9F6] border border-[#EBE6DF] text-[#181A20] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all cursor-pointer"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
                <option value={OTHER_ROLE}>{OTHER_ROLE}</option>
              </select>
              <div className="absolute right-3.5 top-3.5 text-[#8C93A3] pointer-events-none">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {role === OTHER_ROLE && (
              <input
                type="text"
                required
                autoFocus
                maxLength={PROFILE_LIMITS.role}
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                placeholder="e.g. Site Reliability Engineer, ML Platform Lead"
                className="mt-2 w-full px-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#EBE6DF] text-[#181A20] placeholder-[#8C93A3] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all"
              />
            )}
          </div>

          {/* Experience Level Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="level" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] font-mono">
                Experience Level
              </label>
              <span className="text-[11px] text-[#2563EB] font-semibold">Calibrates AI Questions</span>
            </div>
            <div className="relative">
              <select
                id="level"
                value={level}
                onChange={(e) => setLevel(e.target.value as ExperienceLevel)}
                className="w-full appearance-none px-4 py-3 pr-11 rounded-xl bg-[#FAF9F6] border border-[#EBE6DF] text-[#181A20] text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all cursor-pointer"
              >
                {EXPERIENCE_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>{lvl}</option>
                ))}
              </select>
              <div className="absolute right-3.5 top-3.5 text-[#8C93A3] pointer-events-none">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-[#64748B]">
              The panel will strictly ask questions matched to the <strong>{level}</strong> tier.
            </p>
          </div>

          {/* Resume — optional */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="resume" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] font-mono">
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
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0]">
                <svg className="w-5 h-5 shrink-0 text-[#059669]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#181A20] truncate">{resumeName}</p>
                  <p className="text-xs text-[#4B5565]">
                    {resumeText.length.toLocaleString()} characters — the panel will ask about this
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearResume}
                  className="text-xs font-semibold text-[#4B5565] hover:text-[#EF4444] transition-colors cursor-pointer shrink-0"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={reading}
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#FAF9F6] border border-dashed border-[#D9D2C7] text-left hover:border-[#2563EB] hover:bg-[#F5F8FF] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
              >
                <svg className="w-5 h-5 shrink-0 text-[#8C93A3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                </svg>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#181A20]">
                    {reading ? 'Reading your resume…' : 'Attach a resume (PDF, TXT or MD)'}
                  </p>
                  <p className="text-xs text-[#8C93A3]">
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
            className="w-full py-3.5 px-4 bg-[#181A20] hover:bg-[#2A2E37] text-[#FFFFFF] font-medium rounded-xl transition-colors duration-150 flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            <span>{submitting ? 'Briefing the panel…' : 'Sign In'}</span>
            {!submitting && (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            )}
          </button>
        </form>
      </div>

      {/* Footer minimal info */}
      <div className="mt-8 text-center text-xs text-[#8C93A3] font-mono">
        Kyro Panel &bull; Technical, Product &amp; HR AI Assessment
      </div>
    </div>
  );
}
