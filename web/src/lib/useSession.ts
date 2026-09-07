import { useEffect, useState } from 'react';
import { emptyModel, type Bid, type CandidateModel, type PanelistId, type SessionEvent } from '@kyro/shared';

/** Live session state, pushed from the server over SSE. One-way. */
export function useSession() {
  const [model, setModel] = useState<CandidateModel>(() => emptyModel('pending'));
  const [bids, setBids] = useState<Bid[]>([]);
  const [speaking, setSpeaking] = useState<PanelistId | null>(null);
  const [caption, setCaption] = useState<{ speaker: string; text: string } | null>(null);
  /** The last thing the candidate said, kept separately so both stay on screen. */
  const [heard, setHeard] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  /**
   * Set once the panel has spoken its closing line. Carries how long that line
   * takes to say, so the room can let it finish before ending the call.
   */
  const [concluded, setConcluded] = useState<{ reason: string; speakMs: number } | null>(null);

  useEffect(() => {
    const es = new EventSource('/events');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = e => {
      const ev: SessionEvent = JSON.parse(e.data);
      switch (ev.type) {
        case 'state': setModel(ev.model); break;
        case 'bids': setBids(ev.bids); break;
        case 'speaking':
          setSpeaking(ev.panelist);
          if (ev.text) setCaption({ speaker: ev.panelist ?? 'panel', text: ev.text });
          break;
        case 'caption':
          if (ev.speaker === 'candidate') setHeard(ev.text);
          else setCaption({ speaker: ev.speaker, text: ev.text });
          break;
        // The scenario also arrives on 'state', but that lands after the reply
        // is already streaming — this one shows up with the question itself.
        case 'scenario': setModel(m => ({ ...m, scenario: ev.scenario })); break;
        // First one wins. The room starts its leave timer off this value, and
        // a second event would replace the object, re-run that effect, and
        // cancel the timer that was about to end the call.
        case 'concluded': setConcluded(c => c ?? { reason: ev.reason, speakMs: ev.speakMs }); break;
      }
    };
    return () => es.close();
  }, []);

  return { model, bids, speaking, caption, heard, connected, concluded };
}
