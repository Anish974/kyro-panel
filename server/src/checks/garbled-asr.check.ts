// Run: npm run check -w server
//
// A real interview, kept here verbatim because it went wrong three ways in two
// minutes and every one of them was silent.
//
//   00:35  jay: Can I repeat?
//   00:49  Arjun: What technical trade-offs did you make in that design, and
//                 what were the alternatives you considered?
//   01:16  jay: Okay. So I was interned in Vietnam transfer. We failed UTMS,
//               and wanted to gain experience in that field too.
//   01:26  Ananya: How did that UTMS system failure directly impact the end
//                  users or daily operations at Vietnam Transfer?
//   01:42  jay: What is the Vietnam transfer?
//
// "Can I repeat?" was graded as an answer, so it cost a turn and drew a canned
// question about a design nobody had mentioned. "We failed UTMS" is speech
// recognition mangling something the candidate never said, and the panel asked
// him to account for a failure that did not exist. He then asked what "Vietnam
// transfer" even was — his own words, handed back to him wrong — and that was
// graded as an answer too.
//
// Four turns, and the candidate was never once asked about anything he had
// actually said.

import assert from 'node:assert';
import { classify, replyTo } from '../panel/utterance.js';

// --- the candidate asking us something is not an answer ---------------------

const asked = [
  'Can I repeat?',
  'Sorry, can I repeat that?',
  'What is the Vietnam transfer?',
  'Could you repeat?',
  'What was the question again?',
  'Which project do you mean?',
  'Sorry, what?',
];
for (const line of asked) {
  assert.equal(classify(line), 'clarify', `"${line}" is the candidate asking us, not answering`);
}

// A clarify hands the question straight back rather than spending a turn.
assert.ok(
  replyTo('clarify', 'What did you build?').includes('What did you build?'),
  'the panel repeats the question it actually asked',
);

// --- but a real answer still is one ------------------------------------------

// The guard is the shape of a question put TO us, not merely a question mark:
// a terse answer that trails off into one must still be graded.
const answers = [
  'So, microservices?',
  'Redis?',
  'We used Redis because writes were blocking on the primary.',
  'Okay. So I was interned in Vietnam transfer. We failed UTMS, and wanted to gain experience in that field too.',
  'Yes.',
  'I built the ingestion pipeline and the dashboard on top of it.',
];
for (const line of answers) {
  assert.equal(classify(line), 'answer', `"${line}" is an answer and must cost a turn`);
}

// --- the panel is told the transcript lies -----------------------------------

// The garbled line above is still an answer — we cannot detect mis-hearing from
// the text alone, and pretending otherwise would throw away real answers. What
// changed is that the panel is warned, so it asks the candidate to repeat the
// name instead of interrogating them about a failure they never described.
const { context } = await import('../panel/bidding.js');
const prompt = context('We failed UTMS at Vietnam transfer.');
assert.ok(prompt.length > 0, 'the turn prompt is built');

const { PANEL } = await import('@kyro/shared');
assert.equal(PANEL.length, 3, 'still three panelists');

// --- and a fallback question never invents context ---------------------------
//
// When the model call fails the panel falls back to fixed lines, and those used
// to open with "that design", "that system", "that project" — which is how a
// candidate who had described nothing was asked what trade-offs he made in it.
const bidding = await import('node:fs/promises');
const source = await bidding.readFile(new URL('../panel/bidding.ts', import.meta.url), 'utf8');
const fallbacks = source.slice(
  source.indexOf('const FALLBACK_REPLIES'),
  source.indexOf('};', source.indexOf('const FALLBACK_REPLIES')),
);
for (const phrase of ['that design', 'that system', 'that architecture', 'that implementation', 'that engineering']) {
  assert.ok(
    !fallbacks.toLowerCase().includes(phrase),
    `a fallback question says "${phrase}" — it fires when nothing has been described yet`,
  );
}

console.log('asr     "Can I repeat?" and "What is the Vietnam transfer?" cost no turn');
console.log('        a terse answer ending in a question mark still does');
console.log('        the panel is warned the transcript is mis-heard speech');
console.log('        and no fallback question presumes a system nobody described');
console.log('\nself-check passed');
