import { useEffect, useState } from 'react';
import { emptyModel, type Bid, type CandidateModel, type PanelistId, type SessionEvent } from '@kyro/shared';

/**
 * Live session state, pushed from the server over SSE. One-way.
 *
 * Takes the interview id because the stream is per-interview now: `/events`
 * with no session lands on the shared ambient one, which is nobody's room. Null
 * until the candidate has signed in, and the stream opens the moment it is not.
 */
export function useSession(sessionId: string | null) {
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
    if (!sessionId) {
      setConnected(false);
      return;
    }

    const es = new EventSource(`/events?session=${encodeURIComponent(sessionId)}`);
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
        case 'concluded': setConcluded({ reason: ev.reason, speakMs: ev.speakMs }); break;
      }
    };
    return () => es.close();
  }, [sessionId]);

  return { model, bids, speaking, caption, heard, connected, concluded };
}
