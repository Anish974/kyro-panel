import { useState } from 'react';
import type { Scorecard as ScorecardData } from '@kyro/shared';
import Room from './screens/Room.js';
import Scorecard from './screens/Scorecard.js';
import Login from './screens/Login.js';

const CANDIDATE_NAME = 'Anish Patankar';

const DEFAULT_SCORECARD: ScorecardData = {
  sessionId: 'demo-session',
  role: 'Senior Backend Engineer',
  candidateName: CANDIDATE_NAME,
  durationSec: 1477,
  verdicts: [
    {
      panelist: 'technical',
      verdict: 'lean_hire',
      score: 3.8,
      confidence: 0.88,
      rationale:
        'Candidate demonstrated strong grasp of distributed cache consistency and database sharding patterns. Handled latency trade-offs well under high concurrency.',
      evidence: [
        { quote: 'We separated read replicas and placed Redis in front with write-through cache.', t: 245 },
        { quote: 'To avoid cascade failures, we implemented circuit breakers with exponential backoff.', t: 612 },
      ],
      ratings: {
        systemDesign: 4.2,
        tradeoffReasoning: 3.9,
        communication: 4.0,
      },
    },
    {
      panelist: 'product',
      verdict: 'hire',
      score: 4.4,
      confidence: 0.92,
      rationale:
        'Great customer empathy and pragmatic phased rollout approach. Articulated business impact and SLO degradation impact clearly.',
      evidence: [
        { quote: 'User experience during degraded network mode was prioritized over non-critical batch analytics.', t: 410 },
      ],
      ratings: {
        customerImpact: 4.5,
        tradeoffReasoning: 4.2,
        ownership: 4.6,
      },
    },
    {
      panelist: 'hr',
      verdict: 'lean_hire',
      score: 3.6,
      confidence: 0.82,
      rationale:
        'Solid communication and proactive cross-team collaboration. Good conflict resolution examples during tight release deadlines.',
      evidence: [
        { quote: 'Partnered directly with the security team to unblock deployment within 24 hours.', t: 890 },
      ],
      ratings: {
        communication: 3.8,
        ownership: 3.7,
      },
    },
  ],
  claims: [
    { id: 'c1', text: 'Reduced 99th percentile API latency from 450ms to 85ms across 12M daily active users.', t: 240, status: 'verified' },
    { id: 'c2', text: 'Architected distributed event streaming using Kafka processing 50k events/sec.', t: 530, status: 'verified' },
    { id: 'c3', text: 'Zero downtime migration of 2TB PostgreSQL cluster to Aurora.', t: 780, status: 'vague', note: 'Lacked details on replication lag monitoring during cutover' },
  ],
  dissent: true,
};

export default function App() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardData | null>(null);

  async function endInterview() {
    try {
      const res = await fetch(`/scorecard?name=${encodeURIComponent(CANDIDATE_NAME)}`);
      if (res.ok) {
        const data = await res.json();
        setScorecard(data);
        return;
      }
    } catch {
      // Backend not reached, fall back to realistic demo scorecard
    }
    setScorecard(DEFAULT_SCORECARD);
  }

  if (!userEmail) {
    return <Login onLogin={(email) => setUserEmail(email)} />;
  }

  return scorecard ? (
    <Scorecard scorecard={scorecard} onBack={() => setScorecard(null)} />
  ) : (
    <Room candidateName={CANDIDATE_NAME} onEnd={endInterview} />
  );
}

