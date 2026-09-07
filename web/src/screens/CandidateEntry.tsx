import { useState } from 'react';
import {
  DEFAULT_DURATION,
  DURATIONS,
  DURATION_LABELS,
  EXPERIENCE_LEVELS,
  PROFILE_LIMITS,
  type Duration,
  type Interview,
} from '@kyro/shared';
import ThemeToggle from '../components/ThemeToggle.js';

interface Props {
  onReady: (interview: Interview) => void;
  onBack: () => void;
}

const ROLES = [
  'Senior Backend Engineer',
  'Backend Engineer',
  'Full-Stack Engineer',
  'Frontend Engineer',
  'Platform / Infrastructure Engineer',
  'Data Engineer',
  'Engineering Manager',
] as const;

const field =
  'w-full px-4 py-3 rounded-xl bg-[#FAF9F6] dark:bg-[#1E232D] border border-[#EBE6DF] dark:border-[#2D333F] text-[#181A20] dark:text-[#F9FAFB] text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all';

export default function CandidateEntry({ onReady, onBack }: Props) {
  const [tab, setTab] = useState<'invite' | 'mock'>('invite');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>(ROLES[0]);
  const [level, setLevel] = useState<string>('Intermediate (2-6 years)');
  const [durationMin, setDurationMin] = useState<Duration>(DEFAULT_DURATION);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function openInvite(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return setError('Paste the code from your invite');

    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/interviews/${encodeURIComponent(trimmed)}`);
      if (!res.ok) throw new Error('No interview for that code. Check it with your recruiter.');
      onReady(await res.json());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startMock(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('What name should the panel call you?');

    setError('');
    setBusy(true);
    try {
      const res = await fetch('/interviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ candidateName: name.trim(), role, level, durationMin, mock: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Could not start that mock interview');
      onReady(body as Interview);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tabClass = (active: boolean) =>
    `flex-1 h-11 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
      active
        ? 'bg-[#181A20] dark:bg-[#F9FAFB] text-white dark:text-[#0F1115] shadow-xs'
        : 'bg-[#FAF9F6] dark:bg-[#1E232D] text-[#4B5565] dark:text-[#94A3B8] hover:text-[#181A20] dark:hover:text-white'
    }`;

  return (
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-[#0F1115] text-[#181A20] dark:text-[#F9FAFB] flex flex-col justify-center items-center px-4 py-12 relative transition-colors duration-200">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md mb-8 text-center flex flex-col items-center">
        <img src="/favicon.png" alt="Kyro Panel Logo" className="w-16 h-16 rounded-2xl mb-4 object-contain drop-shadow-xs" />
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-[#181A20] dark:text-[#F9FAFB]">Kyro Panel</h1>
        <p className="mt-2 text-base text-[#4B5565] dark:text-[#94A3B8]">Join an interview, or practise for one</p>
      </div>

      <div className="w-full max-w-md bg-white dark:bg-[#161920] rounded-2xl border border-[#EBE6DF] dark:border-[#222631] shadow-sm p-8">
        <div className="flex gap-2 mb-6">
          <button type="button" onClick={() => { setTab('invite'); setError(''); }} className={tabClass(tab === 'invite')}>
            I have an invite
          </button>
          <button type="button" onClick={() => { setTab('mock'); setError(''); }} className={tabClass(tab === 'mock')}>
            Mock interview
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 text-sm text-[#EF4444] bg-[#FEF2F2] dark:bg-red-950/40 border border-[#FEE2E2] dark:border-red-800/40 rounded-xl">
            {error}
          </div>
        )}

        {tab === 'invite' ? (
          <form onSubmit={openInvite} className="space-y-4">
            <div>
              <label htmlFor="code" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] dark:text-[#94A3B8] mb-2 font-mono">
                Invite code
              </label>
              <input
                id="code"
                value={code}
                maxLength={16}
                autoFocus
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="MY0W03"
                className={`${field} font-mono tracking-[0.2em] text-center text-lg`}
              />
              <p className="mt-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
                Your recruiter sent a link. The code is the part after <code>?i=</code>.
              </p>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full h-12 rounded-xl bg-[#181A20] dark:bg-[#F9FAFB] text-white dark:text-[#0F1115] font-bold text-sm hover:bg-black dark:hover:bg-white disabled:opacity-60 transition-colors cursor-pointer shadow-xs"
            >
              {busy ? 'Checking…' : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={startMock} className="space-y-4">
            <div>
              <label htmlFor="mname" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] dark:text-[#94A3B8] mb-2 font-mono">
                Your name
              </label>
              <input
                id="mname"
                value={name}
                maxLength={PROFILE_LIMITS.name}
                onChange={e => setName(e.target.value)}
                placeholder="Full name"
                className={field}
              />
            </div>

            <div>
              <label htmlFor="mrole" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] dark:text-[#94A3B8] mb-2 font-mono">
                Practising for
              </label>
              <select id="mrole" value={role} onChange={e => setRole(e.target.value)} className={`${field} cursor-pointer`}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="mlevel" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] dark:text-[#94A3B8] mb-2 font-mono">
                Difficulty
              </label>
              <select id="mlevel" value={level} onChange={e => setLevel(e.target.value)} className={`${field} cursor-pointer`}>
                {EXPERIENCE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <p className="mt-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
                Yours to choose here — it is practice. A real interview sets this for you.
              </p>
            </div>

            <div>
              <label htmlFor="mduration" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] dark:text-[#94A3B8] mb-2 font-mono">
                Length
              </label>
              <select
                id="mduration"
                value={durationMin}
                onChange={e => setDurationMin(Number(e.target.value) as Duration)}
                className={`${field} cursor-pointer`}
              >
                {DURATIONS.map(d => <option key={d} value={d}>{DURATION_LABELS[d]}</option>)}
              </select>
              <p className="mt-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
                About one question a minute, shared between the three of them.
              </p>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full h-12 rounded-xl bg-[#181A20] dark:bg-[#F9FAFB] text-white dark:text-[#0F1115] font-bold text-sm hover:bg-black dark:hover:bg-white disabled:opacity-60 transition-colors cursor-pointer shadow-xs"
            >
              {busy ? 'Setting up…' : 'Start mock interview'}
            </button>
          </form>
        )}
      </div>

      <button
        onClick={onBack}
        className="mt-6 text-sm font-semibold text-[#4B5565] dark:text-[#94A3B8] hover:text-[#181A20] dark:hover:text-white transition-colors cursor-pointer"
      >
        ← Back
      </button>
    </div>
  );
}
