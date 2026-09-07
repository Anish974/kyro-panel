import { useEffect, useState, useCallback } from 'react';
import type { Interview, Scorecard as ScorecardData } from '@kyro/shared';
import Room from './screens/Room.js';
import Scorecard from './screens/Scorecard.js';
import Login, { type Candidate } from './screens/Login.js';
import CompanyPortal from './screens/CompanyPortal.js';
import Landing from './screens/Landing.js';
import CandidateEntry from './screens/CandidateEntry.js';
import CompanySignIn from './screens/CompanySignIn.js';
import Deliberating from './screens/Deliberating.js';
import NotFound from './screens/NotFound.js';
import CookieBanner from './components/CookieBanner.js';
import ShortcutsModal from './components/ShortcutsModal.js';
import { currentSession, onAuthChange } from './lib/supabase.js';

const inviteCode = new URLSearchParams(window.location.search).get('i')?.trim() ?? '';
const hasAuthCallback = typeof window !== 'undefined' && (
  window.location.hash.includes('access_token=') ||
  window.location.hash.includes('error=') ||
  window.location.search.includes('code=')
);

export default function App() {
  const [view, setView] = useState<'landing' | 'candidate' | 'login' | 'company' | 'room' | 'scorecard' | '404'>(
    inviteCode ? 'login' : (hasAuthCallback ? 'company' : 'landing'),
  );
  const [invite, setInvite] = useState<Interview | null>(null);
  const [inviteError, setInviteError] = useState('');
  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardData | null>(null);
  const [returnToView, setReturnToView] = useState<'landing' | 'company' | 'room'>('landing');
  const [deliberating, setDeliberating] = useState(false);
  // The write-up failed. Kept with the duration it was asked for so a retry
  // sends the same number — see endInterview for why we retry rather than
  // invent a card.
  const [scorecardError, setScorecardError] = useState<{ message: string; durationSec: number } | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Global Keyboard Shortcuts Listener
  const handleGlobalKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore key events when user is typing in an input, textarea, or select
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target as HTMLElement)?.isContentEditable) {
      return;
    }

    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      e.preventDefault();
      setShortcutsOpen(prev => !prev);
      return;
    }

    if (e.key === 'd' || e.key === 'D') {
      const isDark = document.documentElement.classList.contains('dark');
      if (isDark) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('kyro_theme', 'light');
      } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('kyro_theme', 'dark');
      }
      return;
    }

    if (e.key === 't' || e.key === 'T') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Navigation shortcuts (only when not in an active interview room)
    if (view !== 'room' && !deliberating) {
      if (e.key === 'c' || e.key === 'C') {
        setView('candidate');
      } else if (e.key === 'h' || e.key === 'H') {
        setView('company');
      }
    }
  }, [view, deliberating]);

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  async function endInterview(actualDurationSec?: number) {
    if (!candidate) return;
    setScorecardError(null);
    setDeliberating(true);
    const durationParam = typeof actualDurationSec === 'number' ? actualDurationSec : 0;
    const query = new URLSearchParams({
      name: candidate.name,
      role: candidate.role,
      level: candidate.level || 'Intermediate (2-6 years)',
      duration: String(durationParam),
      ...(invite?.mock ? { mock: '1' } : {}),
      ...(invite && !invite.mock ? { code: invite.code } : {}),
    }).toString();

    try {
      const res = await fetch(`/scorecard?${query}`);
      if (res.ok) {
        const data: ScorecardData = await res.json();
        if (typeof actualDurationSec === 'number') {
          data.durationSec = actualDurationSec;
        }
        setScorecard(data);
        setReturnToView('room');
        setView('scorecard');
        setDeliberating(false);
        return;
      }
      // Falling through here used to leave the room sitting on the deliberating
      // screen forever, because nothing after the `if` set any state.
      throw new Error(`The server could not write the scorecard (${res.status}).`);
    } catch (err) {
      console.warn('Could not fetch the scorecard from the server:', err);
      setScorecardError({ message: (err as Error).message, durationSec: durationParam });
      setDeliberating(false);
    }
  }

  useEffect(() => {
    void currentSession().then(session => setSignedIn(session !== null));
    return onAuthChange(session => setSignedIn(session !== null));
  }, []);

  useEffect(() => {
    if (!inviteCode) return;
    let mounted = true;
    void (async () => {
      try {
        const res = await fetch(`/interviews/${encodeURIComponent(inviteCode)}`);
        if (!mounted) return;
        if (res.ok) setInvite(await res.json());
        else setInviteError('That invite link is not valid or has expired. Please check with your recruiter.');
      } catch {
        if (mounted) setInviteError('Could not reach the server. Please check your connection and reload.');
      }
    })();
    return () => { mounted = false; };
  }, []);

  function handleLogin(c: Candidate) {
    setCandidate(c);
    if (invite) {
      void fetch(`/interviews/${encodeURIComponent(invite.code)}/start`, { method: 'POST' }).catch(() => {});
    }
    setView('room');
  }

  function handleSelectScorecard(sc: ScorecardData) {
    setScorecard(sc);
    setReturnToView('company');
    setView('scorecard');
  }

  function handleScorecardBack() {
    if (returnToView === 'company') {
      setView('company');
    } else {
      setScorecard(null);
      setCandidate(null);
      setInvite(null);
      setView('landing');
    }
  }

  function renderView() {
    if (deliberating && candidate) {
      return <Deliberating candidateName={candidate.name} role={candidate.role} />;
    }

    // The write-up failed. This used to render three invented `lean_no_hire`
    // verdicts at 2.5 with rationales nobody wrote — a negative hiring document
    // manufactured out of a network error, on an interview that may have gone
    // perfectly. The transcript is still in the server's memory, so the honest
    // answer is to say what happened and offer to ask again.
    if (scorecardError) {
      return (
        <div className="min-h-screen bg-[#FAF9F6] dark:bg-[#0F1115] grid place-items-center px-4">
          <div className="max-w-md w-full rounded-3xl border border-[#EBE6DF] dark:border-[#222631] bg-white dark:bg-[#161920] p-8 flex flex-col gap-4 shadow-xs text-center">
            <h1 className="font-display text-xl font-extrabold text-gray-950 dark:text-white">
              The scorecard did not come back
            </h1>
            <p className="text-sm text-[#4B5565] dark:text-[#94A3B8] leading-relaxed">
              The interview finished, but the panel's write-up could not be fetched. Nothing has
              been scored yet — no verdict has been recorded either way.
            </p>
            <p className="text-xs font-mono text-[#A48D78] dark:text-[#CBB9A4] break-words">
              {scorecardError.message}
            </p>
            <p className="text-xs text-[#4B5565] dark:text-[#94A3B8]">
              Try again before leaving this page. The conversation is held in the server's memory
              and a reload will lose it.
            </p>
            <div className="flex gap-3 justify-center pt-1">
              <button
                onClick={() => void endInterview(scorecardError.durationSec)}
                className="h-10 px-5 rounded-xl bg-[#181A20] dark:bg-white text-white dark:text-[#181A20] text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer"
              >
                Try again
              </button>
              <button
                onClick={() => { setScorecardError(null); setCandidate(null); setInvite(null); setView('landing'); }}
                className="h-10 px-5 rounded-xl border border-[#EBE6DF] dark:border-[#222631] bg-white dark:bg-[#161920] text-sm font-bold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#1E232D] transition-colors cursor-pointer"
              >
                Leave without a scorecard
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (inviteError) {
      return (
        <NotFound
          onHome={() => { setInviteError(''); setView('landing'); }}
          onCandidate={() => { setInviteError(''); setView('candidate'); }}
          onCompany={() => { setInviteError(''); setView('company'); }}
          message={inviteError}
        />
      );
    }

    if (view === 'landing') {
      return (
        <Landing
          onCompany={() => setView('company')}
          onCandidate={() => setView('candidate')}
        />
      );
    }

    if (view === 'candidate') {
      return (
        <CandidateEntry
          onBack={() => setView('landing')}
          onReady={picked => {
            setInvite(picked);
            setView('login');
          }}
        />
      );
    }

    if (view === 'company') {
      if (signedIn === undefined) {
        return (
          <div className="min-h-screen bg-[#FAF9F6] dark:bg-[#0F1115] grid place-items-center px-4 text-center">
            <p className="text-sm text-[#4B5565] dark:text-[#94A3B8]">Checking your session…</p>
          </div>
        );
      }
      if (!signedIn) return <CompanySignIn onBack={() => setView('landing')} />;
      return (
        <CompanyPortal onSelectScorecard={handleSelectScorecard} onBack={() => setView('landing')} />
      );
    }

    if (view === 'scorecard' && scorecard) {
      return (
        <Scorecard
          scorecard={scorecard}
          onBack={handleScorecardBack}
        />
      );
    }

    if (view === 'room' && candidate) {
      return (
        <Room
          candidateName={candidate.name}
          role={candidate.role}
          level={candidate.level}
          onEnd={endInterview}
        />
      );
    }

    if (view === 'login') {
      if (!invite) {
        return (
          <div className="min-h-screen bg-[#FAF9F6] dark:bg-[#0F1115] grid place-items-center px-4 text-center">
            <p className="text-sm text-[#4B5565] dark:text-[#94A3B8]">Opening your interview…</p>
          </div>
        );
      }
      return (
        <Login
          invite={invite}
          onLogin={handleLogin}
          onBack={() => {
            if (window.location.search) {
              window.history.replaceState({}, '', window.location.pathname);
            }
            setInvite(null);
            setView('landing');
          }}
        />
      );
    }

    // Fallback 404
    return (
      <NotFound
        onHome={() => setView('landing')}
        onCandidate={() => setView('candidate')}
        onCompany={() => setView('company')}
      />
    );
  }

  return (
    <>
      {renderView()}
      <CookieBanner />
      <ShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
}
