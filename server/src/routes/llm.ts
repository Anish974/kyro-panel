import { Router, type Response } from 'express';
import { panelistById, type Panelist } from '@kyro/shared';
import { runPanel } from '../panel/bidding.js';
import { ingest } from '../panel/ledger.js';
import {
  addTurn,
  announceConclusion,
  getModel,
  notePremiseDenied,
  releaseHold,
  shouldConclude,
  takeHold,
} from '../panel/model.js';
import { continues, repeats } from '../panel/continuation.js';
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
 * How many growing ASR finals in a row the panel will sit through before it
 * answers anyway.
 *
 * Two is enough to cover a candidate drawing breath mid-sentence, and short
 * enough that nobody is left talking into a dead room. There is no signal for
 * "they have finished" — Agora finalises on a pause, not on a full stop — so
 * this is a ceiling on how wrong the guess can be, not a way of getting it
 * right. Widening `silence_duration_ms` in agora-agent.ts is what actually
 * reduces how often the guess is needed.
 */
const HOLD_LIMIT = 2;

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
    return stream(res, panelistById(asker), "Sorry, I didn't catch that — could you say it again?", true);
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
    // A denial has to outlive this reply, or the next question carries on from
    // the same invented premise — which is how one candidate was asked about a
    // bot he had never mentioned three times running.
    if (kind === 'correction') notePremiseDenied();

    console.log(`[llm] ${kind} — answering without spending a turn (turns stay at ${model.turns})`);
    return stream(res, panelistById(asker), replyTo(kind, lastQuestion), true);
  }

  // Agora posts a turn per ASR final, and a long answer arrives as several
  // growing finals — each carrying the whole utterance so far. addTurn already
  // merges those into one transcript entry, but the panel had still run on
  // every one of them: that is three different panelists asking three questions
  // about one paragraph, and three of the ten turns spent on it.
  //
  // The candidate is still talking, so the panel holds the floor — but only for
  // so long. Left uncapped this went badly the other way: a candidate's answer
  // arrived as six growing finals, every one after the first was swallowed, and
  // the room stayed silent long enough that the transcript ends with them
  // saying "Hello? Hello?". Silence is the right answer to an interruption and
  // the wrong answer to a question.
  const previous = [...getModel().transcript].reverse().find(t => t.speaker === 'candidate');
  const growing = previous ? continues(previous.text, answer) : false;
  const resent = previous ? repeats(previous.text, answer) : false;

  if ((growing || resent) && takeHold(HOLD_LIMIT)) {

    // A continuation carries words the transcript has not seen, and addTurn
    // supersedes the shorter version with it. A resend carries nothing new —
    // and addTurn would not supersede it either, because `continues` refuses
    // equal strings, so it would append a duplicate line AND count a second
    // turn. Recording nothing is the whole point of recognising a resend.
    if (growing) {
      ingest(answer);
      addTurn({ speaker: 'candidate', text: answer });
    }

    console.log(`[llm] ${resent ? 'resend' : 'continuation'} — holding the floor`);
    return silence(res);
  }
  releaseHold();

  // Ledger first: the panel should be able to bid on a fresh contradiction.
  const claims = ingest(answer);
  const decision = await runPanel(answer);
  const winner = panelistById(decision.winner);

  console.log(
    `turn ${getModel().turns} | ` +
    decision.bids.map(b => `${b.panelist} ${b.score}`).join('  ') +
    ` | floor -> ${winner.name} (${winner.voice})`,
  );

  for (const claim of claims) broadcast({ type: 'claim', claim });
  broadcast({ type: 'scenario', scenario: getModel().scenario });
  broadcast({ type: 'bids', bids: decision.bids, winner: decision.winner });
  broadcast({ type: 'state', model: getModel() });

  stream(res, winner, decision.reply, decision.interruptable);

  // bidding.ts switches to its closing instructions once this is true, so the
  // reply just streamed IS the goodbye. Nothing used to happen next: the panel
  // said "we're concluding to finalise your scorecard" and then sat there until
  // the idle timeout, and the candidate had to work out that it was over.
  //
  // Told after the reply is on the wire, with an estimate of how long it takes
  // to say, so the room can let the closing finish before it ends the call.
  //
  // Once, and only once. The room restarts its leave timer every time it hears
  // this, so a second one means the call never ends — the panel said goodbye
  // five times in a row that way. Equality on the turn number used to be the
  // guard; it cannot express "or the booked time ran out", so the latch is
  // explicit and lives with the session that owns it.
  if (shouldConclude() && announceConclusion()) {
    console.log(
      `[llm] turn ${getModel().turns} of ${getModel().durationMin}min — panel has closed the interview`,
    );
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

/**
 * A well-formed completion carrying no words, so Agora speaks nothing.
 *
 * Agora expects an answer to every turn it posts. This is how the panel
 * declines to take one without leaving the request hanging.
 */
function silence(res: Response): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  res.write(`data: ${JSON.stringify({
    id: `kyro-${Date.now()}`,
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

/** The SSE shape Agora expects, with the speaking panelist's voice attached. */
function stream(res: Response, speaker: Panelist, reply: string, interruptable: boolean): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  // Every reply the panel speaks goes out through here, so the caption is
  // broadcast here too — the "didn't catch that" path used to speak silently.
  broadcast({ type: 'speaking', panelist: speaker.id, text: reply });

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

  for (const word of reply.split(' ')) {
    send({
      id,
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: { content: word + ' ' }, finish_reason: null }],
    });
  }

  send({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
  res.write('data: [DONE]\n\n');
  res.end();
}

export default router;
