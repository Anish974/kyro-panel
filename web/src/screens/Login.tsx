import { useRef, useState } from 'react';
import { PROFILE_LIMITS } from '@kyro/shared';
import { RESUME_ACCEPT, extractResumeText } from '../lib/resume.js';

export interface Candidate {
  name: string;
  role: string;
  email: string;
  /** Plain text pulled out of the uploaded resume, if one was attached. */
  resumeText?: string;
}

interface Props {
  onLogin: (candidate: Candidate) => void;
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

export default function Login({ onLogin }: Props) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>(ROLES[0]);
  const [customRole, setCustomRole] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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

  /**
   * Hands the panel who it is about to interview, then enters the room.
   *
   * The POST is what makes the panel open by name, so a failure is worth
   * saying out loud rather than silently degrading to a stranger in the room —
   * but it must not lock anyone out of a demo either, so it warns and proceeds.
   */
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
    if (!email.trim()) {
      setError('Please enter your email or Gmail address');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }
    setError('');
    void enterRoom({
      name: name.trim(),
      role: effectiveRole,
      email: email.trim(),
      ...(resumeText ? { resumeText } : {}),
    });
  };

  const handleQuickDemo = () => {
    setName('Anish Patankar');
    setRole(ROLES[0]);
    setEmail('candidate@gmail.com');
    setPassword('demo12345');
    void enterRoom({
      name: 'Anish Patankar',
      role: ROLES[0],
      email: 'candidate@gmail.com',
      ...(resumeText ? { resumeText } : {}),
    });
  };

  return (
    <div className="min-h-screen w-full bg-[#FAF9F6] flex flex-col justify-center items-center px-4 py-12 select-none">
      {/* Top Brand Tag / Logo */}
      <div className="w-full max-w-md mb-8 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F4F1EA] border border-[#EBE6DF] text-xs font-mono text-[#4B5565] uppercase tracking-wider mb-4">
          <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse"></span>
          AI-Powered Multi-Panel Platform
        </div>

        {/* Prominent Headline / Topic */}
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#181A20] font-display">
          Kyro Panel
        </h1>
        <p className="mt-2 text-base text-[#4B5565] font-sans">
          Tell us who you are and what you are interviewing for, then enter the room
        </p>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md bg-[#FFFFFF] rounded-2xl border border-[#EBE6DF] shadow-sm p-8 sm:p-10">
        <form onSubmit={handleSubmit} className="space-y-6">
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
              {/* Native select on purpose: keyboard, screen readers and mobile
                  pickers all work for free, and the list is short. */}
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

            <p className="mt-2 text-xs text-[#8C93A3]">
              The panel pitches every question at this role, and it heads your scorecard.
            </p>
          </div>

          {/* Resume — optional. What it buys the candidate is that the panel
              opens on their real projects instead of a textbook question, so
              the label says that rather than "upload a file". */}
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

          <div>
            <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] mb-2 font-mono">
              Gmail / Email Address
            </label>
            <div className="relative">
              <input
                id="email"
                type="email"
                required
                maxLength={PROFILE_LIMITS.email}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="yourname@gmail.com"
                className="w-full px-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#EBE6DF] text-[#181A20] placeholder-[#8C93A3] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all"
              />
              <div className="absolute right-3.5 top-3.5 text-[#8C93A3] pointer-events-none">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] font-mono">
                Password
              </label>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter any password"
                className="w-full px-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#EBE6DF] text-[#181A20] placeholder-[#8C93A3] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-[#8C93A3] hover:text-[#181A20] transition-colors"
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
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

        <div className="mt-6 pt-6 border-t border-[#EBE6DF] flex items-center justify-between text-xs text-[#8C93A3]">
          <span>Any Gmail &amp; password accepted</span>
          <button
            type="button"
            onClick={handleQuickDemo}
            className="text-[#2563EB] hover:underline font-medium cursor-pointer"
          >
            Quick Fill Demo
          </button>
        </div>
      </div>

      {/* Footer minimal info */}
      <div className="mt-8 text-center text-xs text-[#8C93A3] font-mono">
        Kyro Panel &bull; Technical, Product &amp; HR AI Assessment
      </div>
    </div>
  );
}
