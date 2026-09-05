// Run: npm run check -w server
//
// The room's live captions are built on a message schema we do not own. If
// Agora's field names or turn_status semantics drift — or if this mapping was
// wrong to begin with — the captions silently stop updating mid-sentence, which
// looks like a network problem rather than a parsing bug. This pins the mapping
// to the shapes in Agora's own conversational-ai-api types.

import assert from 'node:assert';
import { isAgentState, toTranscript } from '../../../web/src/lib/transcript.js';

// 1. Candidate speech. `final` is a boolean on user.transcription.
const partial = toTranscript({
  object: 'user.transcription',
  text: 'We sharded the ledger by tenant',
  final: false,
  turn_id: 3,
});
assert.ok(partial, 'a user transcription must render');
assert.equal(partial.speaker, 'candidate', 'user.transcription is the candidate');
assert.equal(partial.final, false, 'a partial must not be marked final');
assert.equal(partial.turnId, 3, 'turn id carries through');

assert.equal(
  toTranscript({ object: 'user.transcription', text: 'done', final: true, turn_id: 3 })!.final,
  true,
  'a completed user line is final',
);

// 2. Panel speech. Here it is turn_status, NOT `final` — 0 in progress, 1 end,
//    2 interrupted. Only 0 means more words are coming.
const speaking = toTranscript({
  object: 'assistant.transcription',
  text: 'Walk me through the write contention',
  turn_status: 0,
  turn_id: 4,
});
assert.ok(speaking, 'an agent transcription must render');
assert.equal(speaking.speaker, 'panel', 'assistant.transcription is the panel');
assert.equal(speaking.final, false, 'turn_status 0 is still in progress');

for (const [status, label] of [[1, 'ended'], [2, 'interrupted']] as const) {
  const done = toTranscript({
    object: 'assistant.transcription',
    text: 'Walk me through the write contention',
    turn_status: status,
    turn_id: 4,
  })!;
  assert.equal(done.final, true, `turn_status ${status} (${label}) must stop the line growing`);
}

// 3. Everything else on the channel is not a caption. Rendering these would put
//    raw telemetry in front of the candidate.
for (const object of ['message.metrics', 'message.error', 'message.interrupt', 'turn.finished']) {
  assert.equal(toTranscript({ object, text: 'x', turn_id: 1 }), null, `${object} must not render`);
}
assert.equal(toTranscript({ object: 'user.transcription', text: '', final: true }), null,
  'an empty line must not render');
assert.equal(toTranscript({}), null, 'a message with no object must not render');

// 4. Agent state is a closed set — an unknown value must not reach the UI map.
for (const state of ['idle', 'listening', 'thinking', 'speaking', 'silent']) {
  assert.ok(isAgentState(state), `${state} is a real agent state`);
}
for (const junk of ['SPEAKING', 'busy', '', undefined, null, 7]) {
  assert.equal(isAgentState(junk), false, `${String(junk)} must be rejected`);
}

console.log('transcript  user.transcription uses final, assistant uses turn_status');
console.log('            metrics/errors/interrupts never reach the caption bar');
console.log('            agent state is a closed set');
console.log('\nself-check passed');
