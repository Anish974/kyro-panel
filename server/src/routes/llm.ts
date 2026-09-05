import { Router, type Response } from 'express';
import { panelistById, type Panelist } from '@kyro/shared';
import { runPanel } from '../panel/bidding.js';
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
    console.log(`[llm] ${kind} — answering without spending a turn (turns stay at ${model.turns})`);
    return stream(res, panelistById(asker), replyTo(kind, lastQuestion), true);
  }

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
});

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
