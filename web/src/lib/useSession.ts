import { useEffect, useRef, useState } from 'react';
import {
  emptyModel,
  speakingTimeMs,
  type Bid,
  type CandidateModel,
  type PanelistId,
  type SessionEvent,
} from '@kyro/shared';

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

  /** Brings the speaking tile down once the estimated reply has been said. */
  const stopSpeaking = useRef<number | null>(null);

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
          // Nothing ever set this back. `speaking` went up on every reply and
          // came down on nothing, so a panelist who spoke once read
          // "Speaking…" for the rest of the interview — including while the
          // candidate was answering them. A candidate watching that tile has
          // no way to tell a question that was never heard from one that was —
          // the tile claims a voice either way, which is what a candidate was
          // looking at when they reported the panel speaking into silence.
          //
          // Agora never tells us when the audio finished, so the estimate the
          // server already uses to time the closing line is what brings it
          // down. A candidate who starts talking brings it down sooner, below.
          if (stopSpeaking.current) clearTimeout(stopSpeaking.current);
          stopSpeaking.current = window.setTimeout(
            () => setSpeaking(null),
            speakingTimeMs(ev.text ?? ''),
          );
          break;
        case 'caption':
          if (ev.speaker === 'candidate') {
            setHeard(ev.text);
            // They are talking, so the panel is not. This is the signal that
            // does not depend on an estimate being right.
            if (stopSpeaking.current) clearTimeout(stopSpeaking.current);
            setSpeaking(null);
          } else {
            setCaption({ speaker: ev.speaker, text: ev.text });
          }
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
