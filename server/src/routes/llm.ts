import { Router, type Response } from 'express';
import { panelistById, type Panelist, type PanelistId } from '@kyro/shared';
import { CONCLUDE_AT_TURN, runPanel } from '../panel/bidding.js';
import { ingest } from '../panel/ledger.js';
import { getModel } from '../panel/model.js';
import { classify, replyTo } from '../panel/utterance.js';
import { broadcast } from './events.js';

// Agora's Conversational AI Engine calls this as if it were an LLM, in
// OpenAI chat-completions format, once per completed candidate turn.
// We answer with SSE. The first chunk carries metadata that sets the winning
// panelist's voice and whether they can be interrupted.
//
// https://docs.agora.io/en/conversational-ai/develop/custom-llm

const router = Router();

/**
 * How often a half-written reply is pushed to the room as a caption.
 *
 * The words go to Agora token by token because TTS can start on the first few.
 * A reader cannot, so the caption is coalesced — roughly the rate a person
 * reads at, and a few events a turn instead of a few hundred.
 */
const CAPTION_INTERVAL_MS = 150;

interface ChatMessage { role: string; content: string }

router.post('/chat/completions', async (req, res) => {
  const messages: ChatMessage[] = req.body?.messages ?? [];
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const answer = (lastUser?.content ?? '').trim();

  console.log(`[llm] received /chat/completions turn from Agora | candidate heard: "${answer}"`);

  // Agora fires a turn on silence too. Running the whole panel on an empty
  // string burns three LLM calls to produce a non-sequitur, so answer it here.
  if (!answer) {
    const asker = getModel().lastSpeaker ?? 'technical';
    console.log(`[llm] empty answer, asking candidate to repeat`);
    return speak(res, panelistById(asker), "Sorry, I didn't catch that — could you say it again?", true);
  }

  // Show what we heard before the panel spends a second thinking about it.
  // Without this the room looks deaf while the LLM call is in flight.
  broadcast({ type: 'caption', speaker: 'candidate', text: answer, final: true });

  // Logistics and clarifying questions are not answers. A human panel confirms
  // and waits — it does not grade "am I audible" and it does not spend one of
  // the ten questions on it. Answering here keeps runPanel (and therefore
  // addTurn) out of it entirely, so the candidate's real introduction is still
  // turn 1 when it arrives.
  const kind = classify(answer);
  if (kind !== 'answer') {
    const model = getModel();
    const asker = model.lastSpeaker ?? 'technical';
    // The last thing a panelist actually said, to hand back on a "repeat that".
    const lastQuestion =
      [...model.transcript].reverse().find(t => t.speaker !== 'candidate')?.text ?? null;
    console.log(`[llm] ${kind} — answering without spending a turn (turns stay at ${model.turns})`);
    return speak(res, panelistById(asker), replyTo(kind, lastQuestion), true);
  }

  // Ledger first: the panel should be able to bid on a fresh contradiction.
  const claims = ingest(answer);

  // The response is opened the moment the floor is decided, not once the reply
  // is finished. Everything after that point is written into a connection Agora
  // is already reading, so the first words reach TTS while the rest of the
  // sentence is still being generated.
  let writer: Writer | null = null;
  let floor: PanelistId | null = null;
  let caption = '';
  let captionAt = 0;

  const decision = await runPanel(answer, {
    onFloor: (bids, id) => {
      const speaker = panelistById(id);
      floor = id;
      console.log(
        `turn ${getModel().turns} | ` +
        bids.map(b => `${b.panelist} ${b.score}`).join('  ') +
        ` | floor -> ${speaker.name} (${speaker.voice})`,
      );

      for (const claim of claims) broadcast({ type: 'claim', claim });
      broadcast({ type: 'scenario', scenario: getModel().scenario });
      broadcast({ type: 'bids', bids, winner: id });
      // No text yet. The tile lights up now; the words follow as they are
      // written, which is also roughly when they are spoken.
      broadcast({ type: 'speaking', panelist: id });

      writer = open(res, speaker, true);
    },

    onReplyDelta: text => {
      writer?.write(text);
      caption += text;
      // One caption event per token would be a few hundred messages a turn for
      // a sentence nobody can read that fast anyway.
      const now = Date.now();
      if (now - captionAt >= CAPTION_INTERVAL_MS) {
        captionAt = now;
        broadcast({ type: 'caption', speaker: floor!, text: caption, final: false });
      }
    },
  });

  const winner = panelistById(decision.winner);

  // Either the reply streamed, or it did not exist to stream — a canned line
  // from the keyword fallback, or a panel that never reached the LLM at all.
  if (!writer) {
    speak(res, winner, decision.reply, decision.interruptable);
  } else {
    // onFloor assigns this from inside a callback, which the compiler cannot
    // see — it still believes the variable is the null it was initialised to.
    const w = writer as Writer;
    if (!w.sent().trim()) w.write(decision.reply);
    w.end();
    broadcast({ type: 'caption', speaker: decision.winner, text: decision.reply, final: true });
  }

  broadcast({ type: 'state', model: getModel() });

  // bidding.ts switches to its closing instructions at this turn, so the reply
  // just streamed IS the goodbye. Nothing used to happen next: the panel said
  // "we're concluding to finalise your scorecard" and then sat there until the
  // idle timeout, and the candidate had to work out that it was over.
  //
  // Told after the reply is on the wire, with an estimate of how long it takes
  // to say, so the room can let the closing finish before it ends the call.
  if (getModel().turns >= CONCLUDE_AT_TURN) {
    console.log(`[llm] turn ${getModel().turns} — panel has closed the interview`);
    broadcast({
      type: 'concluded',
      reason: 'The panel has finished the interview.',
      speakMs: speakingTime(decision.reply),
    });
  }
});

/** Rough speaking time. ~150 words a minute, plus a beat of silence after. */
const speakingTime = (text: string): number =>
  Math.min(20_000, Math.round((text.split(/\s+/).length / 150) * 60_000) + 2_500);

interface Writer {
  /** Send some more of the reply. Agora speaks it as it lands. */
  write(text: string): void;
  /** Everything written so far, for the transcript and the caption. */
  sent(): string;
  /** Finish the response. Safe to call once. */
  end(): void;
}

/**
 * Opens the response and claims the floor for one panelist.
 *
 * Split from the words on purpose. The panel takes a moment to decide WHO
 * speaks and rather longer to decide WHAT they say, and the voice can be
 * selected the instant the first of those is known — so the metadata chunk goes
 * out early and the reply trickles in behind it.
 */
function open(res: Response, speaker: Panelist, interruptable: boolean): Writer {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  const id = `kyro-${Date.now()}`;
  const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  // Agora reads only this chunk's metadata and ignores its choices. This is
  // what makes three interviewers share one voice pipeline: tts_params.params
  // is merged into the configured vendor's params for this response only.
  //
  // MiniMax takes voice_setting.voice_id and nothing else. We used to send a
  // voice_type alongside it, copied from the doc's example — but that example
  // is a different vendor's field name, and mixing a foreign key into the
  // params update is a good way to have the whole update ignored and the reply
  // spoken in the agent's default voice instead. One vendor, one shape.
  send({
    id,
    object: 'chat.completion.custom_metadata',
    choices: [],
    metadata: {
      interruptable,
      tts_params: {
        params: {
          voice_setting: { voice_id: speaker.voice },
        },
      },
    },
  });

  let all = '';
  let closed = false;

  return {
    write(text) {
      if (closed || !text) return;
      all += text;
      send({
        id,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
      });
    },
    sent: () => all,
    end() {
      if (closed) return;
      closed = true;
      send({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
      res.write('data: [DONE]\n\n');
      res.end();
    },
  };
}

/** A whole reply at once, for the turns the panel does not have to think about. */
function speak(res: Response, speaker: Panelist, reply: string, interruptable: boolean): void {
  // Every reply the panel speaks goes out through here, so the caption is
  // broadcast here too — the "didn't catch that" path used to speak silently.
  broadcast({ type: 'speaking', panelist: speaker.id, text: reply });
  const w = open(res, speaker, interruptable);
  w.write(reply);
  w.end();
}

export default router;
