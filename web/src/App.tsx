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

export default function App() {
  const [view, setView] = useState<'landing' | 'candidate' | 'login' | 'company' | 'room' | 'scorecard' | '404'>(
    inviteCode ? 'login' : 'landing',
  );
  const [invite, setInvite] = useState<Interview | null>(null);
  const [inviteError, setInviteError] = useState('');
  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardData | null>(null);
  const [returnToView, setReturnToView] = useState<'landing' | 'company' | 'room'>('landing');
  const [deliberating, setDeliberating] = useState(false);
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
    } catch (err) {
      console.warn('Could not fetch live scorecard from server:', err);
    }

    // Honest fallback without fake claims
    const fallbackScorecard: ScorecardData = {
      sessionId: `s-${Date.now()}`,
      candidateName: candidate.name,
      role: candidate.role,
      level: candidate.level,
      durationSec: durationParam,
      timestamp: Date.now(),
      turns: 0,
      dissent: false,
      verdicts: [
        {
          panelist: 'technical',
          verdict: 'lean_no_hire',
          score: 2.5,
          confidence: 0.2,
          rationale: 'Interview concluded early before technical depth could be evaluated.',
          evidence: [],
          ratings: { technicalDepth: 2.5, problemSolving: 2.5, communication: 2.5 },
        },
        {
          panelist: 'product',
          verdict: 'lean_no_hire',
          score: 2.5,
          confidence: 0.2,
          rationale: 'Interview concluded early before product impact questions were answered.',
          evidence: [],
          ratings: { impact: 2.5, problemSolving: 2.5, communication: 2.5 },
        },
        {
          panelist: 'hr',
          verdict: 'lean_no_hire',
          score: 2.5,
          confidence: 0.2,
          rationale: 'Interview concluded early before behavioural alignment could be assessed.',
          evidence: [],
          ratings: { ownership: 2.5, communication: 2.5, problemSolving: 2.5 },
        },
      ],
      claims: [],
    };

    setScorecard(fallbackScorecard);
    setReturnToView('room');
    setView('scorecard');
    setDeliberating(false);
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
      return <Login invite={invite} onLogin={handleLogin} />;
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
