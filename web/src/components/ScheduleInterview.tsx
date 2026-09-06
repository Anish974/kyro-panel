import { useState } from 'react';
import { EXPERIENCE_LEVELS, PROFILE_LIMITS, type Interview } from '@kyro/shared';
import { authedFetch } from '../lib/supabase.js';

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

const field =
  'w-full px-4 py-3 rounded-xl bg-[#FAF9F6] dark:bg-[#1E232D] border border-[#EBE6DF] dark:border-[#2D333F] text-[#181A20] dark:text-[#F9FAFB] text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all';

export default function ScheduleInterview() {
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>(ROLES[0]);
  const [customRole, setCustomRole] = useState('');
  const [level, setLevel] = useState<string>('Intermediate (2-6 years)');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Interview | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const effectiveRole = role === OTHER_ROLE ? customRole.trim() : role;
  const link = created ? `${window.location.origin}/?i=${created.code}` : '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Who is being interviewed?');
    if (!effectiveRole) return setError('Type the role you are hiring for');

    setError('');
    setCreating(true);
    try {
      const res = await authedFetch('/interviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ candidateName: name.trim(), role: effectiveRole, level }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Could not schedule that interview');
      setCreated(body as Interview);
      setName('');
      setCustomRole('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function copyCode() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setCopiedCode(false);
    }
  }

  if (created) {
    return (
      <section className="bg-white dark:bg-[#161920] rounded-3xl border border-[#EBE6DF] dark:border-[#222631] shadow-xs p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-display text-lg font-extrabold text-[#181A20] dark:text-[#F9FAFB] flex items-center gap-2">
              <span>Interview scheduled</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                Active
              </span>
            </h2>
            <p className="mt-1 text-sm text-[#4B5565] dark:text-[#94A3B8]">
              Send this link to <strong className="text-[#181A20] dark:text-white">{created.candidateName}</strong>. It opens the room with{' '}
              <strong className="text-[#181A20] dark:text-white">{created.role}</strong> at <strong className="text-[#181A20] dark:text-white">{created.level}</strong> already set.
            </p>
          </div>
        </div>

        {/* Link Input Row */}
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <input readOnly value={link} onFocus={e => e.currentTarget.select()} className={`${field} font-mono`} />
          <button
            type="button"
            onClick={copy}
            className="h-[46px] px-5 rounded-xl bg-[#181A20] dark:bg-[#F9FAFB] text-white dark:text-[#0F1115] text-sm font-bold hover:bg-black dark:hover:bg-white transition-colors cursor-pointer whitespace-nowrap shadow-xs active:scale-95"
          >
            {copied ? 'Copied link!' : 'Copy link'}
          </button>
        </div>

        {/* Access Code Explanation Box */}
        <div className="mt-3.5 p-4 rounded-2xl bg-[#FAF9F6] dark:bg-[#1E232D] border border-[#EBE6DF] dark:border-[#2D333F] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[#2563EB] dark:text-blue-400 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div className="text-xs text-[#4B5565] dark:text-[#94A3B8] leading-relaxed">
              <span className="font-bold text-gray-900 dark:text-gray-100 mr-1.5">Interview Access Code:</span>
              <span className="font-mono font-extrabold text-xs text-[#2563EB] dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-md border border-blue-200/60 dark:border-blue-800/60 mr-1.5">{created.code}</span>
              <span className="text-gray-500 dark:text-gray-400">— candidate can click direct link or enter this code on the landing page.</span>
            </div>
          </div>
          <button
            type="button"
            onClick={copyCode}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#161920] border border-[#EBE6DF] dark:border-[#2D333F] hover:bg-gray-50 dark:hover:bg-[#222631] text-xs font-bold text-gray-800 dark:text-gray-200 transition-all cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto shadow-2xs active:scale-95 flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span>{copiedCode ? 'Copied code!' : 'Copy Code'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setCreated(null)}
          className="mt-4 text-sm font-semibold text-[#2563EB] dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1.5"
        >
          <span>+ Schedule another candidate</span>
        </button>
      </section>
    );
  }

  return (
    <section className="bg-white dark:bg-[#161920] rounded-3xl border border-[#EBE6DF] dark:border-[#222631] shadow-xs p-6 sm:p-8">
      <h2 className="font-display text-lg font-extrabold text-[#181A20] dark:text-[#F9FAFB]">Schedule an interview</h2>
      <p className="mt-1 text-sm text-[#4B5565] dark:text-[#94A3B8]">
        You set the role and the bar. The candidate gets a link and turns up to it.
      </p>

      {error && (
        <div className="mt-4 p-3 text-sm text-[#EF4444] bg-[#FEF2F2] dark:bg-red-950/40 border border-[#FEE2E2] dark:border-red-800/40 rounded-xl">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="md:col-span-1">
          <label htmlFor="cand" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] dark:text-[#94A3B8] mb-2 font-mono">
            Candidate
          </label>
          <input
            id="cand"
            value={name}
            maxLength={PROFILE_LIMITS.name}
            onChange={e => setName(e.target.value)}
            placeholder="Full name"
            className={field}
          />
        </div>

        <div className="md:col-span-1">
          <label htmlFor="crole" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] dark:text-[#94A3B8] mb-2 font-mono">
            Role
          </label>
          <select id="crole" value={role} onChange={e => setRole(e.target.value)} className={`${field} cursor-pointer`}>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            <option value={OTHER_ROLE}>{OTHER_ROLE}</option>
          </select>
          {role === OTHER_ROLE && (
            <input
              autoFocus
              value={customRole}
              maxLength={PROFILE_LIMITS.role}
              onChange={e => setCustomRole(e.target.value)}
              placeholder="e.g. Site Reliability Engineer"
              className={`${field} mt-2`}
            />
          )}
        </div>

        <div className="md:col-span-1">
          <label htmlFor="clevel" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] dark:text-[#94A3B8] mb-2 font-mono">
            Bar
          </label>
          <select id="clevel" value={level} onChange={e => setLevel(e.target.value)} className={`${field} cursor-pointer`}>
            {EXPERIENCE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <div className="md:col-span-3">
          <button
            type="submit"
            disabled={creating}
            className="h-[46px] px-6 rounded-xl bg-[#2563EB] text-white text-sm font-bold hover:bg-[#1D4ED8] disabled:opacity-60 transition-colors cursor-pointer shadow-xs"
          >
            {creating ? 'Scheduling…' : 'Create invite link'}
          </button>
        </div>
      </form>
    </section>
  );
}
