import { useState } from 'react';
import type { Scorecard as ScorecardData } from '@kyro/shared';
import Room from './screens/Room.js';
import Scorecard from './screens/Scorecard.js';

const CANDIDATE_NAME = 'Anish Patankar';

export default function App() {
  const [scorecard, setScorecard] = useState<ScorecardData | null>(null);

  async function endInterview() {
    const res = await fetch(`/scorecard?name=${encodeURIComponent(CANDIDATE_NAME)}`);
    setScorecard(await res.json());
  }

  return scorecard ? (
    <Scorecard scorecard={scorecard} onBack={() => setScorecard(null)} />
  ) : (
    <Room candidateName={CANDIDATE_NAME} onEnd={endInterview} />
  );
}
