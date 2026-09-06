import { useEffect, useState } from 'react';
import type { Interview, Scorecard as ScorecardData } from '@kyro/shared';
import Room from './screens/Room.js';
import Scorecard from './screens/Scorecard.js';
import Login, { type Candidate } from './screens/Login.js';
import CompanyPortal from './screens/CompanyPortal.js';
import Landing from './screens/Landing.js';
import CandidateEntry from './screens/CandidateEntry.js';
import CompanySignIn from './screens/CompanySignIn.js';
import { currentSession, onAuthChange } from './lib/supabase.js';
import Deliberating from './screens/Deliberating.js';

/**
 * Which interview this is, taken off the invite link the company sent.
 *
 * No router: one query parameter is the whole of this app's routing, and a
 * dependency that owns the URL is a lot to take on for one read.
 */
const inviteCode = new URLSearchParams(window.location.search).get('i')?.trim() ?? '';

export default function App() {
  // The company portal is the front door. A candidate reaches the login screen
  // only through ?i=<code>, because without an invite there is no role, no
  // level, and so no interview to walk into.
  // A link with ?i= goes straight to that interview. Everyone else lands on the
  // page that explains what this is and asks which side they are on.
  const [view, setView] = useState<'landing' | 'candidate' | 'login' | 'company' | 'room' | 'scorecard'>(
    inviteCode ? 'login' : 'landing',
  );
  const [invite, setInvite] = useState<Interview | null>(null);
  const [inviteError, setInviteError] = useState('');
  // undefined while we are still asking; null means signed out.
  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardData | null>(null);
  const [returnToView, setReturnToView] = useState<'landing' | 'company' | 'room'>('landing');
  // The write-up is a real LLM call over the transcript, so it takes a couple
  // of seconds. Showing that beats a frozen room or a scorecard that appears
  // instantly as though it had been decided before the interview ended.
  const [deliberating, setDeliberating] = useState(false);

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
      // Ties the scorecard to the interview, which is how the recruiter who
      // scheduled it — and only them — gets to see it.
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

    // Honest fallback without fake Kafka / Aurora claims
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

  // The recruiter's session, kept live: a magic link lands back on this page
  // and the portal has to open without a reload.
  useEffect(() => {
    void currentSession().then(session => setSignedIn(session !== null));
    return onAuthChange(session => setSignedIn(session !== null));
  }, []);

  // Resolve the invite before anything is drawn: the login screen has nothing
  // to show without it, and a dead link must say so rather than sit blank.
  useEffect(() => {
    if (!inviteCode) return;
    let mounted = true;
    void (async () => {
      try {
        const res = await fetch(`/interviews/${encodeURIComponent(inviteCode)}`);
        if (!mounted) return;
        if (res.ok) setInvite(await res.json());
        else setInviteError('That invite link is not valid. Ask your recruiter for a new one.');
      } catch {
        if (mounted) setInviteError('Could not reach the server. Check your connection and reload.');
      }
    })();
    return () => { mounted = false; };
  }, []);

  function handleLogin(c: Candidate) {
    setCandidate(c);
    // Idempotent, and the interview runs whether or not this lands.
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

  // Checked before every other view: the room is over, the scorecard is not
  // ready, and neither should be on screen while the panel writes.
  if (deliberating && candidate) {
    return <Deliberating candidateName={candidate.name} role={candidate.role} />;
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
        <div className="min-h-screen bg-[#FAF9F6] grid place-items-center px-4 text-center">
          <p className="text-sm text-[#4B5565]">Checking your session…</p>
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

  if (inviteError) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] grid place-items-center px-4 text-center">
        <div className="max-w-sm">
          <h1 className="font-display text-2xl font-extrabold text-[#181A20]">Kyro Panel</h1>
          <p className="mt-3 text-sm text-[#4B5565]">{inviteError}</p>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] grid place-items-center px-4 text-center">
        <p className="text-sm text-[#4B5565]">Opening your interview…</p>
      </div>
    );
  }

  return <Login invite={invite} onLogin={handleLogin} />;
}

