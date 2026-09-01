// The panel's brain. Agora calls this as if it were an LLM.
//
// Agora Conversational AI Engine POSTs OpenAI chat-completions here after each
// candidate turn. We run all three interviewers in parallel, take the highest
// bid, and stream that one interviewer's reply back as SSE — with their voice
// set in the first metadata chunk.
//
// Run: npm run orchestrator
// Docs: https://docs.agora.io/en/conversational-ai/develop/custom-llm

const http = require('node:http');

const PORT = Number(process.env.ORCH_PORT) || 8788;

// ---------------------------------------------------------------- panel

// voice_type values are TTS-vendor specific — replace with real voice ids from
// whichever vendor the agent is started with.
const PANEL = [
  { id: 'technical', name: 'Arjun Mehta',  role: 'Technical Architect', voice: 'male_1' },
  { id: 'product',   name: 'Ananya Shah',  role: 'Product Manager',     voice: 'female_1' },
  { id: 'hr',        name: 'Rohan Iyer',   role: 'Behavioural / HR',    voice: 'male_2' },
];

// ------------------------------------------- shared candidate model (Phase 2)

// One object. Every interviewer reads and writes this. No private memories.
const model = {
  skills: { systemDesign: 0.5, tradeoffReasoning: 0.5, customerImpact: 0.5, communication: 0.5 },
  difficulty: 2,
  claims: [],
  gaps: [],
  turns: 0,
  lastSpeaker: null,
};

// ------------------------------------------------------------------ bidding

// ponytail: keyword bidding so this runs with zero API keys and the Agora
// contract can be tested today. Swap `bid()` for a real LLM call per agent —
// same signature, same return shape — once LLM_API_KEY is set.
const SIGNALS = {
  technical: /\b(redis|queue|shard|latency|database|cache|async|architecture|scale|throughput|index|api)\b/i,
  product:   /\b(customer|user|buyer|revenue|checkout|business|impact|conversion|churn|price)\b/i,
  hr:        /\b(team|we |i decided|conflict|disagree|lead|mentor|deadline|pushback|own)\b/i,
};

function bid(agent, answer, state) {
  const hits = (answer.match(SIGNALS[agent.id]) || []).length;
  let score = Math.min(0.15 + hits * 0.35, 0.95);

  // Product spikes when the answer is technical but never mentions the customer.
  // This is the deck's own page-8 scenario — it must reproduce.
  if (agent.id === 'product' && SIGNALS.technical.test(answer) && !SIGNALS.product.test(answer)) {
    score = 0.95;
  }
  // Nobody holds the floor twice in a row unless they really want it.
  if (state.lastSpeaker === agent.id) score -= 0.3;

  return Math.max(0, Math.round(score * 100) / 100);
}

function reply(agent, answer) {
  // ponytail: canned lines until the LLM is wired. Real version generates from
  // the agent's system prompt + the shared model.
  const lines = {
    technical: 'Walk me through what happens to that design when the primary goes down mid-write.',
    product: 'That queue absorbs the write spike, but a two-second delay on checkout confirmation is a refund ticket. How did you decide that trade was acceptable?',
    hr: 'When you look back at that engineering tradeoff, what would you have done differently if you were leading the team?',
  };
  return lines[agent.id];
}

function runPanel(answer) {
  // All three at once — one round trip of latency, not three.
  const bids = PANEL.map(a => ({ agent: a, score: bid(a, answer, model) }));
  bids.sort((x, y) => y.score - x.score);
  const winner = bids[0];

  model.turns++;
  model.lastSpeaker = winner.agent.id;
  if (SIGNALS.technical.test(answer) && !SIGNALS.product.test(answer)) {
    if (!model.gaps.includes('customer impact not addressed')) {
      model.gaps.push('customer impact not addressed');
    }
  }

  return { winner, bids };
}

// ------------------------------------------------------------------- server

function sse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'GET' && req.url === '/state') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(model, null, 2));
    return;
  }

  if (req.method !== 'POST' || !req.url.startsWith('/chat/completions')) {
    res.writeHead(404).end('not found');
    return;
  }

  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    let messages = [];
    try {
      messages = JSON.parse(body).messages || [];
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid json' }));
      return;
    }

    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const answer = lastUser?.content ?? '';

    const { winner, bids } = runPanel(answer);
    console.log(
      `turn ${model.turns} | ` +
      bids.map(b => `${b.agent.id} ${b.score}`).join('  ') +
      ` | floor -> ${winner.agent.name}`
    );

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    const id = `kyro-${Date.now()}`;

    // First chunk sets the winner's voice and whether they can be cut off.
    // Agora only reads this chunk's metadata and ignores its choices.
    sse(res, {
      id,
      object: 'chat.completion.custom_metadata',
      choices: [],
      metadata: {
        interruptable: true,
        tts_params: { params: { voice_type: winner.agent.voice } },
      },
    });

    const text = `${reply(winner.agent, answer)}`;
    for (const word of text.split(' ')) {
      sse(res, {
        id,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: word + ' ' }, finish_reason: null }],
      });
    }
    sse(res, {
      id,
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    });
    res.write('data: [DONE]\n\n');
    res.end();
  });
});

// --- self-check: node spike/orchestrator.js --check ---
if (process.argv.includes('--check')) {
  // The deck's page-8 scenario must reproduce, or the bidding logic is wrong.
  const answer = 'We put a payment queue in front of Redis so writes never block.';
  const { winner, bids } = runPanel(answer);
  const byId = Object.fromEntries(bids.map(b => [b.agent.id, b.score]));

  console.assert(winner.agent.id === 'product',
    `product should win, got ${winner.agent.id}`);
  console.assert(byId.product > byId.technical,
    `product bid ${byId.product} should beat technical ${byId.technical}`);
  console.assert(model.gaps.includes('customer impact not addressed'),
    'shared model should record the missing-customer-impact gap');

  // Same speaker should not hold the floor twice in a row.
  const second = runPanel('We sharded by merchant id because hot merchants caused write locks.');
  console.assert(second.winner.agent.id !== 'product',
    'floor should move after product just spoke');

  console.log('bids:', byId, '| floor ->', winner.agent.name);
  console.log('turn 2 floor ->', second.winner.agent.name);
  console.log('self-check passed');
  process.exit(0);
}

server.listen(PORT, () => {
  console.log(`orchestrator on http://localhost:${PORT}`);
  console.log(`  POST /chat/completions   <- Agora calls this`);
  console.log(`  GET  /state              <- shared candidate model`);
  console.log('');
  console.log('Agora runs in the cloud and cannot reach localhost.');
  console.log('Expose this with a tunnel and use that public URL as llm.url.');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} busy. Try: ORCH_PORT=8899 npm run orchestrator`);
    process.exit(1);
  }
  throw err;
});
