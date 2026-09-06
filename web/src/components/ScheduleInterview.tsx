import { useState } from 'react';
import { EXPERIENCE_LEVELS, PROFILE_LIMITS, type Interview } from '@kyro/shared';

// The hiring side of the product. The company names the candidate, the role and
// the bar, and gets back a link. Everything the candidate used to choose about
// their own interview is chosen here instead — see server/src/panel/interviews.ts.

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
  'w-full px-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#EBE6DF] text-[#181A20] text-sm ' +
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

  const effectiveRole = role === OTHER_ROLE ? customRole.trim() : role;
  const link = created ? `${window.location.origin}/?i=${created.code}` : '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Who is being interviewed?');
    if (!effectiveRole) return setError('Type the role you are hiring for');

    setError('');
    setCreating(true);
    try {
      const res = await fetch('/interviews', {
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

  // Clipboard needs a secure context and permission, and has neither in every
  // browser. The link is on screen and selectable either way, so a failure here
  // is worth a shrug rather than an error.
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (created) {
    return (
      <section className="bg-white rounded-3xl border border-[#EBE6DF] shadow-xs p-6 sm:p-8">
        <h2 className="font-display text-lg font-extrabold text-[#181A20]">Interview scheduled</h2>
        <p className="mt-1 text-sm text-[#4B5565]">
          Send this link to <strong>{created.candidateName}</strong>. It opens the room with{' '}
          <strong>{created.role}</strong> at <strong>{created.level}</strong> already set.
        </p>

        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <input readOnly value={link} onFocus={e => e.currentTarget.select()} className={`${field} font-mono`} />
          <button
            type="button"
            onClick={copy}
            className="h-[46px] px-5 rounded-xl bg-[#181A20] text-white text-sm font-bold hover:bg-black transition-colors cursor-pointer whitespace-nowrap"
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setCreated(null)}
          className="mt-4 text-sm font-semibold text-[#2563EB] hover:underline cursor-pointer"
        >
          Schedule another
        </button>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-3xl border border-[#EBE6DF] shadow-xs p-6 sm:p-8">
      <h2 className="font-display text-lg font-extrabold text-[#181A20]">Schedule an interview</h2>
      <p className="mt-1 text-sm text-[#4B5565]">
        You set the role and the bar. The candidate gets a link and turns up to it.
      </p>

      {error && (
        <div className="mt-4 p-3 text-sm text-[#EF4444] bg-[#FEF2F2] border border-[#FEE2E2] rounded-xl">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="md:col-span-1">
          <label htmlFor="cand" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] mb-2 font-mono">
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
          <label htmlFor="crole" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] mb-2 font-mono">
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
          <label htmlFor="clevel" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] mb-2 font-mono">
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
            className="h-[46px] px-6 rounded-xl bg-[#2563EB] text-white text-sm font-bold hover:bg-[#1D4ED8] disabled:opacity-60 transition-colors cursor-pointer"
          >
            {creating ? 'Scheduling…' : 'Create invite link'}
          </button>
        </div>
      </form>
    </section>
  );
}
