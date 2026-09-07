// Run: npm run check -w server
//
// Three interviewers share one voice pipeline. The voice only changes because
// the first SSE chunk of each reply names it, which means every place a
// panelist speaks has to agree about who is speaking — and one of them did not.
//
// The agent's starting voice was Ananya's while the greeting said "I'm Arjun
// Mehta, technical architect". A female voice introduced itself as Arjun on
// every interview, and nothing failed, because a voice is just a string.
// These assertions are the only thing that would have caught it.

import assert from 'node:assert';
import { PANEL, panelistById } from '@kyro/shared';
import { GREETER, buildJoinBody, greeting } from '../panel/agora-agent.js';

const body = buildJoinBody({
  channel: 'demo-channel',
  token: 'test-token',
  orchestratorUrl: 'https://example.test',
  orchestratorKey: 'test-secret',
  candidate: { name: 'Anish Patankar', role: 'Data Engineer', level: 'Intermediate (2-6 years)' },
});

const props = (body as { properties: Record<string, never> }).properties;
const tts = props.tts as unknown as { params: { voice_setting: { voice_id: string } } };
const startingVoice = tts.params.voice_setting.voice_id;

// 1. The greeting is spoken in the agent's STARTING voice — greeting_message
//    never passes through /chat/completions, so no per-turn override exists yet.
assert.equal(
  startingVoice,
  panelistById(GREETER).voice,
  'the agent must start in the voice of whoever speaks the greeting',
);

// 2. And the greeting must actually claim to be that person.
const line = greeting({ name: 'Anish Patankar', role: 'Data Engineer' });
assert.ok(
  line.includes(panelistById(GREETER).name),
  'the greeting must introduce itself as the panelist whose voice is speaking it',
);

// 3. Every other panelist is named too — the candidate is told who is in the
//    room before anyone else takes the floor.
for (const p of PANEL) {
  assert.ok(line.includes(p.name), `${p.name} must be introduced in the greeting`);
}

// 4. Distinct voices. Two panelists sharing one voice id is indistinguishable
//    from the voice override silently failing, which is the bug above.
const voices = PANEL.map(p => p.voice);
assert.equal(new Set(voices).size, PANEL.length, 'every panelist needs their own voice id');
for (const v of voices) {
  assert.ok(v.trim().length > 0, 'a blank voice id falls back to the default and breaks the illusion');
}

// 5. The candidate's own details survive into the greeting.
assert.ok(line.includes('Anish'), 'the greeting opens by name');
assert.ok(line.includes('Data Engineer'), 'and names the role being interviewed for');

// 6. It is read aloud, so it has to be written for the ear. A slash is spoken
//    as "slash" and a bracketed level as "open paren two to six years".
const spokenLine = greeting({
  name: 'Anish Patankar',
  role: 'Data Engineer',
  level: 'Intermediate (2-6 years)',
});
assert.ok(!spokenLine.includes('/'), 'no slashes — TTS reads them out');
assert.ok(!/[()]/.test(spokenLine), 'no brackets — TTS reads those out too');
assert.ok(
  !spokenLine.includes('2-6 years'),
  'the experience level is for the panel prompt, not for reading aloud',
);

// 7. Filler words must be disabled.
//
// In Agora Conversational AI + MiniMax, filler words start TTS in the previous
// speaker's voice. Because MiniMax does not dynamically hot-swap voices
// mid-stream, the entire question gets spoken in the filler's voice (male
// speaking female and vice versa), and dynamic metadata resets drop audio.
const filler = props.filler_words as unknown as {
  enable?: boolean;
  content?: { static_config?: { phrases?: string[] } };
} | undefined;

assert.equal(
  filler?.enable,
  false,
  'filler words must be disabled to prevent cross-gender voice swaps and audio dropouts',
);

for (const phrase of filler?.content?.static_config?.phrases ?? []) {
  assert.ok(
    phrase.split(/\s+/).length <= 3,
    `filler "${phrase}" is a sentence, not a murmur — it will be said in the wrong voice`,
  );
  assert.ok(
    !/\b(i|me|my|let me|give me)\b/i.test(phrase),
    `filler "${phrase}" speaks for whoever is about to talk, in the voice of whoever just did`,
  );
}

console.log(`voice  agent starts as ${panelistById(GREETER).name} (${startingVoice})`);
console.log('       greeting introduces all three, and every voice id is distinct');
console.log('       filler words are disabled so questions are always in the speaker’s own voice');
console.log('\nself-check passed');

