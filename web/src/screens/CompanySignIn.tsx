import { useState, useEffect } from 'react';
import { authConfigured, checkAuthConfigured, sendMagicLink } from '../lib/supabase.js';
import ThemeToggle from '../components/ThemeToggle.js';

interface Props {
  onBack: () => void;
}

export default function CompanySignIn({ onBack }: Props) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [isConfigured, setIsConfigured] = useState(authConfigured);

  useEffect(() => {
    checkAuthConfigured().then(configured => {
      setIsConfigured(configured);
    });
  }, []);

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
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-[#0F1115] text-[#181A20] dark:text-[#F9FAFB] flex flex-col justify-center items-center px-4 py-12 relative transition-colors duration-200">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md mb-8 text-center flex flex-col items-center">
        <img src="/favicon.png" alt="Kyro Panel Logo" className="w-16 h-16 rounded-2xl mb-4 object-contain drop-shadow-xs" />
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-[#181A20] dark:text-[#F9FAFB]">Kyro Panel</h1>
        <p className="mt-2 text-base text-[#4B5565] dark:text-[#94A3B8]">Sign in to schedule interviews and read scorecards</p>
      </div>

      <div className="w-full max-w-md bg-white dark:bg-[#161920] rounded-2xl border border-[#EBE6DF] dark:border-[#222631] shadow-sm p-8">
        {!isConfigured && (
          <div className="mb-5 p-3 text-sm text-[#B45309] dark:text-amber-400 bg-[#FFFBEB] dark:bg-amber-950/40 border border-[#FDE68A] dark:border-amber-800/40 rounded-xl">
            Sign-in is not configured on this deployment. Set <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> (or <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code>).
          </div>
        )}

        {sent ? (
          <div className="text-center py-4">
            <h2 className="font-display text-lg font-extrabold text-[#181A20] dark:text-[#F9FAFB]">Check your inbox</h2>
            <p className="mt-2 text-sm text-[#4B5565] dark:text-[#94A3B8]">
              A sign-in link is on its way to <strong className="text-[#181A20] dark:text-white">{email}</strong>. Opening it brings you
              straight back here.
            </p>
            <button
              type="button"
              onClick={() => { setSent(false); setEmail(''); }}
              className="mt-5 text-sm font-semibold text-[#2563EB] dark:text-blue-400 hover:underline cursor-pointer"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-[#EF4444] bg-[#FEF2F2] dark:bg-red-950/40 border border-[#FEE2E2] dark:border-red-800/40 rounded-xl">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] dark:text-[#94A3B8] mb-2 font-mono">
                Work email
              </label>
              <input
                id="email"
                type="email"
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-4 py-3 rounded-xl bg-[#FAF9F6] dark:bg-[#1E232D] border border-[#EBE6DF] dark:border-[#2D333F] text-[#181A20] dark:text-[#F9FAFB] placeholder-[#8C93A3] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={busy || !authConfigured}
              className="w-full h-12 rounded-xl bg-[#181A20] dark:bg-[#F9FAFB] text-white dark:text-[#0F1115] font-bold text-sm hover:bg-black dark:hover:bg-white disabled:opacity-60 transition-colors cursor-pointer shadow-xs"
            >
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </button>

            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] text-center">
              No password. The link signs you in and expires on its own.
            </p>
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
