// Run: npm run check -w server
//
// The floor moves.
//
// One real interview ran ten turns like this:
//
//   Rohan  welcome
//   Arjun  what UI components were you responsible for?
//   Arjun  why Mapbox over Leaflet?
//   Arjun  why split the live coordinates?
//   Arjun  how did you handle the incorrect names in code?
//   Arjun  which array method?
//   Arjun  what condition inside the filter?
//   Arjun  what data structure for the replacements?
//   Arjun  what key, and how did you handle case sensitivity?
//   Rohan  closing
//
// Arjun asked eight of the ten. Ananya asked none — and then wrote "impact and
// problem-solving were entirely absent" and scored the candidate 1.0 on an axis
// she never put a single question to.
//
// The "just spoke" penalty subtracts 0.3, which rotates the floor only when the
// bids are close. On a deeply technical answer they are not: the model bids the
// technical panelist near 0.9 and the others near 0.3, so 0.6 still wins, and
// wins again, and again. That gap is what this check reproduces — with the
// keyword scorer everyone bids 0.15 and the floor rotates on its own, which is
// why an offline fixture would have proved nothing.

import assert from 'node:assert';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { PANEL, type PanelistId } from '@kyro/shared';

// The shape production actually returns on a technical answer.
const LOPSIDED = JSON.stringify({
  bids: {
    technical: { score: 0.9, reason: 'implementation detail to chase', intent: 'probe', quality: 0.5 },
    product: { score: 0.3, reason: 'no user impact yet', intent: 'challenge', quality: 0.4 },
    hr: { score: 0.3, reason: 'ownership unclear', intent: 'followup', quality: 0.4 },
  },
  // Every turn, the same panelist. A model that ignores the eligible set it
  // was given is the case this has to survive: rotation is enforced in code,
  // not asked for in the prompt.
  floor: 'technical',
  reply: 'What backed that structure, and how did you key it?',
});

const provider = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: LOPSIDED } }] }));
  });
});

await new Promise<void>(r => provider.listen(0, '127.0.0.1', r));
process.env.LLM_BASE_URL = `http://127.0.0.1:${(provider.address() as AddressInfo).port}/v1`;
process.env.LLM_MODEL = 'rotation-check';
process.env.LLM_API_KEY = 'rotation-check';

const { runPanel } = await import('../panel/bidding.js');
const model = await import('../panel/model.js');

model.reset(true);
model.setProfile({ name: 'Nids', role: 'Frontend Engineer', level: 'Intern' });

const ANSWERS = [
  'I built the main map dashboard using the Mapbox and Leaflet APIs to track the drone location.',
  'For the live drone coordinates I used Mapbox, and for the base map I used Leaflet.',
  'I handled the incorrect region names in JavaScript before rendering them.',
  'I used filter to drop the region names that did not match.',
  'I cross checked the region names against the Leaflet map and replaced them.',
  'I used a HashMap to store the replacements instead of if-else branches.',
  'The socket reconnects and the queue drains once the connection is back.',
  'We sharded the write path by tenant because noisy tenants held the locks.',
];

const spoke: PanelistId[] = [];
const said: string[] = [];
for (const answer of ANSWERS) {
  const decision = await runPanel(answer);
  spoke.push(decision.winner);
  said.push(decision.reply);
}

// The model writes ONE question now, for the panelist it named. Every turn it
// is overruled here is a turn somebody else has to speak, and what they say
// comes off the keyword list — so the list has to be worth hearing. A silent
// or non-question turn is the price of getting this wrong.
for (const [i, reply] of said.entries()) {
  assert.ok(reply.trim().length > 10, `turn ${i + 1} left the candidate with nothing`);
  assert.ok(reply.includes('?'), `turn ${i + 1} said "${reply}" — that asks nothing`);
}

// The guarantee: nobody holds the floor three times running.
let run = 1;
for (let i = 1; i < spoke.length; i++) {
  run = spoke[i] === spoke[i - 1] ? run + 1 : 1;
  assert.ok(
    run <= 2,
    `${spoke[i]} took ${run} turns in a row — two is a follow-up, three is a monologue: ${spoke.join(' ')}`,
  );
}

const asked = Object.fromEntries(PANEL.map(p => [p.id, 0])) as Record<PanelistId, number>;
for (const id of spoke) asked[id] += 1;

// And nobody takes most of the interview. Eight of ten was the real number.
const most = Math.max(...Object.values(asked));
assert.ok(
  most <= Math.ceil(ANSWERS.length * 0.6),
  `one panelist took ${most} of ${ANSWERS.length} turns: ${spoke.join(' ')}`,
);

// Every panelist gets in, which is the point of a panel. With this bid spread
// the old code gave all eight to the technical panelist.
for (const p of PANEL) {
  assert.ok(
    asked[p.id] > 0,
    `${p.id} asked nothing across ${ANSWERS.length} turns and would still have written a verdict: ${spoke.join(' ')}`,
  );
}

provider.close();

console.log(`rotation  ${spoke.join(' ')}`);
console.log(`          ${PANEL.map(p => `${p.id} ${asked[p.id]}`).join(', ')}`);
console.log('          a 0.9 bid cannot hold the floor for a whole interview');
console.log('\nself-check passed');
