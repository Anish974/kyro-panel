// Run: npm run check -w server
//
// A panelist who asked nothing does not get to be sure about the answer.
//
// One real interview: Arjun asked eight of the ten questions, Rohan asked the
// welcome and the closing, and Ananya asked nothing at all. All three then
// wrote verdicts. Ananya's read "Impact and problem-solving were entirely
// absent, as the candidate failed to ground the project in any meaningful
// metrics, user value, or coherent product scope" and scored 1.0 out of 5.
//
// She never put a single question to any of it. That is not a finding about the
// candidate — it is a finding about the interview, and a hiring document that
// presents the two as the same thing is the worst failure this product has.
//
// The rotation cap in bidding.ts makes the silence rarer. This is what happens
// when it occurs anyway: the write-up is told who actually asked, and the
// confidence of anyone who asked nothing is bounded whatever they claim.

import assert from 'node:assert';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { PANEL, type PanelistVerdict } from '@kyro/shared';

// Every panelist comes back loudly certain — the shape that produced the 1.0.
const CONFIDENT = JSON.stringify(
  Object.fromEntries(
    PANEL.map(p => [
      p.id,
      {
        verdict: 'no_hire',
        score: 1,
        confidence: 0.95,
        rationale: 'Impact and problem solving were entirely absent from this interview.',
        evidence: [{ quote: 'I built the main map dashboard using Mapbox and Leaflet.' }],
      },
    ]),
  ),
);

let seenPrompt = '';
const provider = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    seenPrompt = body;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: CONFIDENT } }] }));
  });
});

await new Promise<void>(r => provider.listen(0, '127.0.0.1', r));
process.env.LLM_BASE_URL = `http://127.0.0.1:${(provider.address() as AddressInfo).port}/v1`;
process.env.LLM_MODEL = 'silent-check';
process.env.LLM_API_KEY = 'silent-check';

const { writeVerdicts } = await import('../panel/verdicts.js');
const model = await import('../panel/model.js');

// An interview where only the technical panelist ever spoke.
model.reset(true);
model.setProfile({ name: 'Nids', role: 'Frontend Engineer', level: 'Intern' });
model.addTurn({ speaker: 'candidate', text: 'I built the main map dashboard using Mapbox and Leaflet.' });
model.addTurn({ speaker: 'technical', text: 'Why did you split the live coordinates onto Mapbox?' });
model.addTurn({ speaker: 'candidate', text: 'Because many of the region names on the base map were wrong.' });
model.addTurn({ speaker: 'technical', text: 'How did you handle those names in code?' });

const fallbacks: PanelistVerdict[] = PANEL.map(p => ({
  panelist: p.id,
  verdict: 'lean_no_hire',
  score: 2.5,
  confidence: 0.6,
  rationale: 'tracked',
  evidence: [],
  ratings: {},
}));

const verdicts = await writeVerdicts(fallbacks, 240);
const by = new Map(verdicts.map(v => [v.panelist, v]));

// The write-up has to be told. Without it the model has no way to know it never
// asked anything — the transcript alone reads as a candidate who did not cover
// product, rather than a panel that never brought it up.
assert.match(seenPrompt, /Questions each of you actually asked/, 'the write-up is told who asked what');
assert.match(seenPrompt, /product 0/, 'and that the product panelist asked nothing');

// And the number is bounded whatever the model claimed about itself. It asked
// for 0.95 on all three.
assert.ok(
  by.get('product')!.confidence <= 0.2,
  `a panelist who asked nothing claimed ${by.get('product')!.confidence} confidence`,
);
assert.ok(
  by.get('hr')!.confidence <= 0.2,
  'the same for the panelist who only said hello and goodbye',
);

// The one who actually ran the interview is not punished for it.
assert.ok(
  by.get('technical')!.confidence > 0.2,
  'the panelist who asked the questions keeps their confidence',
);

provider.close();

console.log('silent  the write-up is told how many questions each panelist asked');
console.log('        a panelist who asked none is capped at 0.2 confidence, not 0.95');
console.log('        the one who ran the interview keeps theirs');
console.log('\nself-check passed');
