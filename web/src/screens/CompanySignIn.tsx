import { useState } from 'react';
import { authConfigured, sendMagicLink } from '../lib/supabase.js';

// The only sign-in screen in the product. A recruiter comes back days after an
// interview to read a scorecard, so they need an account that outlives a tab —
// and until they have one, every company's candidates sit behind the same URL.
//
// No password: nothing to reset, nothing to hash, nothing to leak.

interface Props {
  onBack: () => void;
}

export default function CompanySignIn({ onBack }: Props) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return setError('Which email should the link go to?');

    setError('');
    setBusy(true);
    try {
      await sendMagicLink(email.trim());
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md mb-8 text-center flex flex-col items-center">
        <img src="/favicon.png" alt="Kyro Panel Logo" className="w-12 h-12 rounded-xl mb-3 object-contain shadow-2xs" />
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-[#181A20]">Kyro Panel</h1>
        <p className="mt-2 text-base text-[#4B5565]">Sign in to schedule interviews and read scorecards</p>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl border border-[#EBE6DF] shadow-sm p-8">
        {!authConfigured && (
          <div className="mb-5 p-3 text-sm text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] rounded-xl">
            Sign-in is not configured on this deployment. Set <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code>.
          </div>
        )}

        {sent ? (
          <div className="text-center py-4">
            <h2 className="font-display text-lg font-extrabold text-[#181A20]">Check your inbox</h2>
            <p className="mt-2 text-sm text-[#4B5565]">
              A sign-in link is on its way to <strong>{email}</strong>. Opening it brings you
              straight back here.
            </p>
            <button
              type="button"
              onClick={() => { setSent(false); setEmail(''); }}
              className="mt-5 text-sm font-semibold text-[#2563EB] hover:underline cursor-pointer"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-[#EF4444] bg-[#FEF2F2] border border-[#FEE2E2] rounded-xl">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] mb-2 font-mono">
                Work email
              </label>
              <input
                id="email"
                type="email"
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#EBE6DF] text-[#181A20] placeholder-[#8C93A3] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={busy || !authConfigured}
              className="w-full h-12 rounded-xl bg-[#181A20] text-white font-bold text-sm hover:bg-black disabled:opacity-60 transition-colors cursor-pointer"
            >
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </button>

            <p className="text-xs text-[#64748B] text-center">
              No password. The link signs you in and expires on its own.
            </p>
          </form>
        )}
      </div>

      <button onClick={onBack} className="mt-6 text-sm font-semibold text-[#4B5565] hover:text-[#181A20] transition-colors cursor-pointer">
        ← Back
      </button>
    </div>
  );
}
