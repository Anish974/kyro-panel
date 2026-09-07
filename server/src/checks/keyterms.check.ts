// Run: npm run check -w server
//
// What the recogniser is told before the interview starts.
//
// Deepgram mis-hears exactly the words an interview turns on. A real one
// reached the panel as "I was interned in Vietnam transfer. We failed UTMS" —
// a company name guessed at phonetically, and "built" flipped to "failed" — and
// the panel spent a turn asking the candidate to account for a failure that had
// never happened.
//
// Nothing downstream can recover from that: the text is grammatical, so no
// prompt and no classifier can tell it from something the candidate really
// said. The only place to fix it is before the audio is decoded, and we already
// hold the words — the candidate uploaded a resume full of them.

import assert from 'node:assert';
import { buildJoinBody, keyterms } from '../panel/agora-agent.js';

const RESUME = `Intern at Vyoma Aerospace, Pune. Built UTMS, an Unmanned Traffic Management
System for autonomous drones. Used MAVLink for flight control and MQTT over a Mosquitto
broker for telemetry. Backend in Node.js with MongoDB for geospatial queries; frontend in
React with Mapbox. Deployed on AWS EC2 behind Nginx. Also used MAVLink and MQTT again.`;

const jay = { name: 'Jay Sharma', role: 'Full-Stack Engineer', resumeText: RESUME };
const terms = keyterms(jay);

// --- the words that actually get mis-heard --------------------------------

// Acronyms and product names: the ones a recogniser has no reason to know.
for (const term of ['UTMS', 'MAVLink', 'MQTT', 'Vyoma', 'Mosquitto', 'Nginx', 'Mapbox', 'MongoDB']) {
  assert.ok(terms.includes(term), `"${term}" is on the resume and must be boosted`);
}

// The candidate's own name, which the panel says aloud and they say back.
assert.ok(terms.includes('Jay') && terms.includes('Sharma'), 'their name is boosted');

// Name and role are certain to come up, so they outrank a resume mention.
assert.equal(terms[0], 'Jay', 'the name leads');
assert.ok(
  terms.indexOf('MAVLink') < terms.indexOf('Nginx'),
  'a term used twice outranks one used once',
);

// --- and not the words it already gets right --------------------------------

// Every slot spent on a word Deepgram never mishears is a slot a rare one
// needed. These all appear capitalised in the resume above.
for (const noise of ['Built', 'Used', 'Also', 'Backend', 'System', 'Intern', 'The', 'With']) {
  assert.ok(!terms.includes(noise), `"${noise}" is common English and wastes a slot`);
}

// --- single tokens only ------------------------------------------------------
//
// This is the one that silently breaks the feature. Agora sends the list as a
// single space-delimited string, so a term containing a space cannot be told
// apart from two separate terms.
for (const term of terms) {
  assert.ok(!/\s/.test(term), `"${term}" contains whitespace and would split into two terms`);
  assert.ok(term.length >= 2, `"${term}" is too short to boost anything`);
}
assert.ok(terms.length <= 40, `Deepgram caps the list; ${terms.length} terms is too many`);

// --- what actually goes on the wire -----------------------------------------

const asr = (candidate: typeof jay | null) =>
  (buildJoinBody({
    channel: 'c',
    token: 't',
    orchestratorUrl: 'https://example.dev',
    orchestratorKey: 'k',
    candidate,
  }) as { properties: { asr: { params: Record<string, string> } } }).properties.asr.params;

const withResume = asr(jay);
// keyterm is a nova-3 feature. On any other model it is silently ignored.
assert.equal(withResume.model, 'nova-3', 'keyterm only works on nova-3');
assert.ok(withResume.keyterm, 'the terms reach the recogniser');
assert.ok(withResume.keyterm.includes('UTMS'), 'including the ones that were mis-heard');
assert.equal(withResume.keyterm.includes(' '), false, 'terms are joined with %20, not raw spaces');
assert.deepEqual(withResume.keyterm.split('%20'), terms, 'and the encoding round-trips');

// Nothing to boost means no parameter at all — an empty keyterm is something
// Deepgram rejects rather than ignores.
assert.equal('keyterm' in asr(null), false, 'no profile, no keyterm');
assert.deepEqual(keyterms(null), [], 'and no terms either');
assert.deepEqual(
  keyterms({ name: 'Jay', role: 'Data Engineer', resumeText: '' }).length > 0,
  true,
  'a candidate with no resume still gets their name and role boosted',
);

console.log('keyterm the resume is mined for the words a recogniser would guess at');
console.log('        UTMS, MAVLink, Mosquitto, Vyoma — boosted; common English — not');
console.log('        single tokens only, because the list is space-delimited');
console.log('        omitted entirely when there is nothing to boost');
console.log('\nself-check passed');
