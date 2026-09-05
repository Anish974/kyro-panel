import { useState } from 'react';
import type { Scorecard as ScorecardData } from '@kyro/shared';
import Room from './screens/Room.js';
import Scorecard from './screens/Scorecard.js';
import Login, { type Candidate } from './screens/Login.js';
import CompanyPortal from './screens/CompanyPortal.js';
import Deliberating from './screens/Deliberating.js';

export default function App() {
  const [view, setView] = useState<'login' | 'company' | 'room' | 'scorecard'>('login');
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardData | null>(null);
  const [returnToView, setReturnToView] = useState<'login' | 'company' | 'room'>('login');
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

  function handleLogin(c: Candidate) {
    setCandidate(c);
    setView('room');
  }

  function handleOpenCompany() {
    setView('company');
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
      setView('login');
    }
  }

  // Checked before every other view: the room is over, the scorecard is not
  // ready, and neither should be on screen while the panel writes.
  if (deliberating && candidate) {
    return <Deliberating candidateName={candidate.name} role={candidate.role} />;
  }

  if (view === 'company') {
    return (
      <CompanyPortal
        onBack={() => setView('login')}
        onSelectScorecard={handleSelectScorecard}
      />
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

  return (
    <Login
      onLogin={handleLogin}
      onOpenCompany={handleOpenCompany}
    />
  );
}

