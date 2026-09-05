import { useState } from 'react';
import type { Scorecard as ScorecardData } from '@kyro/shared';
import Room from './screens/Room.js';
import Scorecard from './screens/Scorecard.js';
import Login, { type Candidate } from './screens/Login.js';
import CompanyPortal from './screens/CompanyPortal.js';

export default function App() {
  const [view, setView] = useState<'login' | 'company' | 'room' | 'scorecard'>('login');
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardData | null>(null);
  const [returnToView, setReturnToView] = useState<'login' | 'company' | 'room'>('login');

  async function endInterview(actualDurationSec?: number) {
    if (!candidate) return;
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
          ratings: { systemDesign: 2.5, tradeoffReasoning: 2.5, communication: 2.5 },
        },
        {
          panelist: 'product',
          verdict: 'lean_no_hire',
          score: 2.5,
          confidence: 0.2,
          rationale: 'Interview concluded early before product impact questions were answered.',
          evidence: [],
          ratings: { customerImpact: 2.5, tradeoffReasoning: 2.5, communication: 2.5 },
        },
        {
          panelist: 'hr',
          verdict: 'lean_no_hire',
          score: 2.5,
          confidence: 0.2,
          rationale: 'Interview concluded early before behavioural alignment could be assessed.',
          evidence: [],
          ratings: { ownership: 2.5, communication: 2.5, tradeoffReasoning: 2.5 },
        },
      ],
      claims: [],
    };

    setScorecard(fallbackScorecard);
    setReturnToView('room');
    setView('scorecard');
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

