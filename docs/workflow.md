# Kyro Panel — Build Workflow

How we actually build this, in order, with a pass/fail test at every step.

Read this before writing code. It exists so we do not waste days building the
wrong thing in the wrong order.

---

## 0. The one rule we use to decide everything

Every technical choice gets one question:

> **Does this make bidding and the Claims Ledger easier, or harder?**

Reason: real-time voice is table stakes. Every team in this track will have a
talking bot. Only we have three interviewers who argue, share one memory, and
catch contradictions. That is what gets scored.

So we accept a slower, uglier voice pipeline if it makes the multi-agent part
work. We do not accept a beautiful voice pipeline that makes bidding impossible.

---

## 1. The insight that shrinks the whole project

**Three interviewers does not mean three voice pipelines.**

The problem statement itself demands "controlled interviewer turn-taking" — only
one panelist speaks at a time, ever. So the real shape is:

| Thing | How many |
| :--- | :--- |
| Audio stream in (candidate) | **1** |
| Audio stream out (whoever won the floor) | **1** |
| Agent "brains" | 3 — just 3 different prompts to one fast LLM |
| Voices | 3 — same TTS, different voice ID |
| Shared Candidate Model | **1** — a single JSON object |

We are building **one voice pipeline with a swappable persona**, not three
parallel agents. This cuts the work by roughly two thirds and removes the
hardest problem (three models trying to talk over each other).

---

## 2. Architecture

```
Browser                    Server                          Services
───────                    ──────                          ────────

candidate mic ──► Agora RTC ──► streaming STT ──────────► partial text
                                                              │
                                                              ▼
                                              ┌───────────────────────────┐
                                              │  Shared Candidate Model   │
                                              │  (one JSON object)        │
                                              │  skills, claims,          │
                                              │  difficulty, gaps, flags  │
                                              └───────────┬───────────────┘
                                                          │ read
                                          ┌───────────────┼───────────────┐
                                          ▼               ▼               ▼
                                       Agent 1         Agent 2         Agent 3
                                      (Technical)     (Product)         (HR)
                                          │               │               │
                                          └─── bid 0-1 ───┴───────────────┘
                                                          │
                                                          ▼
                                                   Moderator picks
                                                    highest bid
                                                          │
                                                          ▼
                                                  generate reply
                                                          │
                                                          ▼
browser speaker ◄── Agora RTC ◄── TTS (voice of whoever won) ◄──┘
```

Everything on the server is one Node process. No microservices, no queue, no
database until something actually breaks without one.

---

## 3. The latency trick (do not skip this)

The deck claims full-duplex under **700ms**. The obvious implementation misses it:

```
candidate stops talking
  → ask 3 agents to bid       ~200ms
  → moderator picks winner     ~20ms
  → winner generates reply    ~400ms
  → TTS first audio           ~150ms
                              ─────────
                              ~770ms   ✗ too slow
```

**Fix: bid while the candidate is still talking.**

Streaming STT gives partial transcripts continuously. Every ~2 seconds, feed the
partial text to all three agents and update their bids. By the time the candidate
stops, the winner is **already decided**. The bidding cost disappears from the
response path:

```
candidate stops talking
  → winner already known         0ms
  → winner generates reply    ~400ms
  → TTS first audio           ~150ms
                              ─────────
                              ~550ms   ✓
```

This same mechanism gives us **agent-side barge-in for free**: if a bid crosses a
high threshold while the candidate is still speaking, that agent interrupts right
then. The deck promises interruption "from both sides" — this is how we deliver it.

One design decision, two hard requirements solved.

---

## 4. Data contracts

Agree on these before writing code, so both of us can work in parallel.

### Shared Candidate Model

```js
{
  skills: {                      // 0.0 - 1.0 per competency
    systemDesign: 0.78,
    tradeoffReasoning: 0.44,
    customerImpact: 0.21,
    communication: 0.69,
    ownership: 0.55
  },
  difficulty: 3,                 // 1-5, moves during the interview
  claims: [                      // every factual statement, for the ledger
    {
      id: "c7",
      text: "we had zero downtime during the migration",
      timestamp: 252,            // seconds into session
      status: "contradicted",    // verified | vague | contradicted | open
      conflictsWith: "c12"
    }
  ],
  gaps: ["customer impact never mentioned"],
  transcript: [
    { speaker: "candidate", text: "...", t: 250 },
    { speaker: "product",   text: "...", t: 262 }
  ]
}
```

### Bid

```js
{
  agent: "product",
  score: 0.95,                   // 0.0 - 1.0
  reason: "candidate described infra only, no customer impact",
  intent: "challenge"            // probe | challenge | followup | handoff
}
```

Moderator rule for v1: **highest score wins**. Nothing smarter until this proves
insufficient. Add a cooldown only if one agent hogs the floor in testing.

---

## 5. Build phases

Each phase has a **kill test** — if it fails, stop and fix it before moving on.
No phase starts until the one before it passes.

### Phase 1 — One agent, real voice, real barge-in
**Owner:** Nidhi · **Target: day 1–2**

Not three agents. One. No UI beyond a single button, no scoring, no personas.

Build: Agora RTC channel, browser publishes mic, server joins and subscribes,
streaming STT, one LLM reply, TTS back into the channel. Voice activity
detection kills TTS playback the moment the candidate starts speaking.

> **Kill test:** While the AI is mid-sentence, start talking. It must stop within
> ~300ms and respond to what you said. Measure end-to-end latency and write the
> real number down.

If this fails, nothing else matters. Everything below assumes it passes.

---

### Phase 2 — Shared Candidate Model
**Owner:** Anish · **Runs in parallel with Phase 1**

One JSON object, in memory, matching the contract above. A few functions that
read and write it. That is the entire "shared context" requirement.

No voice needed. Test against a hardcoded array of candidate answers.

> **Kill test:** Feed 5 fake answers. Skill scores move sensibly, gaps get
> recorded, and the object is the *only* place state lives — no agent keeps its
> own memory.

---

### Phase 3 — Bidding and turn-taking
**Owner:** Anish · **Target: day 3–4**

Three prompts, one fast LLM, all three run in parallel on the same partial
transcript. Each returns a bid. Moderator takes the max.

Still no voice. Still the hardcoded transcript.

> **Kill test:** Replay the deck's own scenario (page 8). Candidate describes a
> payment queue with Redis. The Technical bid must stay low (nothing to
> challenge) and the Product bid must spike above 0.9 (customer impact missing).
> If our own headline example does not reproduce, the bidding logic is wrong.

---

### Phase 4 — Join Phase 1 and Phase 3, add three voices
**Owner:** both · **Target: day 5**

Wire the orchestrator into the live pipeline. Switch TTS voice by whoever won.
Turn on continuous bidding on partial transcripts (section 3).

> **Kill test:** A real spoken conversation where the floor changes hands at
> least twice, no two agents ever speak at once, and total latency stays under
> ~700ms. Record this — it is the demo.

---

### Phase 5 — Claims Ledger
**Owner:** Anish · **Target: day 6**

Extract factual claims from each answer. Compare against earlier claims. Mark
each as verified, vague, or contradicted.

Run it **after** the interview first. Live updating comes later, and only if
Phase 4 has latency headroom to spare.

> **Kill test:** Deliberately say "we had zero downtime" early and "the queue was
> backed up for an hour" later. The ledger must catch it and cite both timestamps.

---

### Phase 6 — Evidence scorecard
**Owner:** Nidhi · **Target: day 7**

Zero real-time work. Read the final Shared Candidate Model, render three separate
verdicts with quotes and timestamps. **Do not average the three scores** — the
preserved disagreement is the whole point.

Layout is already designed: `design/Scorecard.dc.html`.

> **Kill test:** Every number on the page traces to a specific quote with a
> timestamp. No score exists that we cannot point at a transcript line for.

---

## 6. Work split

| | Anish | Nidhi |
| :--- | :--- | :--- |
| **Owns** | Shared Candidate Model, bidding, moderator, Claims Ledger | Agora transport, STT/TTS, room UI, scorecard UI |
| **Phases** | 2, 3, 5 | 1, 4, 6 |
| **Language** | Plain JS, no voice dependency | Browser + Node |
| **Test data** | Hardcoded transcript array | Real mic |

The two tracks stay independent until Phase 4. Anish must never be blocked
waiting for the voice pipeline, and Nidhi must never be blocked waiting for
bidding logic. That is the point of the split.

Agree the data contracts in section 4 on day 1 and neither side changes them
without telling the other.

---

## 7. Risks, ranked

1. **Bidding latency eats the 700ms budget.** Mitigated by continuous bidding
   (section 3). If it still misses, drop to 2 agents before dropping the bidding —
   bidding is the differentiator, the third persona is not.
2. **Agora + server-side audio takes longer than expected.** Check Agora's own
   docs and sample projects for the server-side/AI agent path before building it
   from scratch; the sponsor likely ships a template.
3. **All three agents want to speak constantly.** Add a cooldown per agent and
   require a minimum bid gap before the floor changes hands.
4. **Contradiction detection produces false positives.** Better to miss a real
   contradiction than to accuse the candidate wrongly. Tune conservative.

---

## 8. What we demo, in order

1. Join screen — AI disclosure, consent (4 seconds, do not linger)
2. Candidate answers a system-design question
3. Technical agent accepts it
4. **Right rail visibly updates: gap flagged, Product bid spikes to 0.95**
5. Product agent interrupts and challenges on customer impact
6. Candidate contradicts an earlier claim — ledger flags it live
7. Scorecard: Technical says hire, Product says no hire, both with quotes

Step 4 is the moment that wins or loses this. Everything in the UI exists to make
that single state change visible to someone watching a screen for five seconds.

---

## 9. Current status

| Phase | Status |
| :--- | :--- |
| Design — 4 screens | Done — `design/` |
| Clickable UI prototype | Done — `index.html` (simulated, no real AI) |
| **Phase 1a — Agora transport** | **Done** — two clients in one channel, audio flows, RTT 82–104 ms |
| Phase 1a — token server | Done — `spike/token-server.js`, no more manual console tokens |
| Phase 1b — agent join REST call | Written — `spike/agent-start.js`, needs Customer ID/Secret + a tunnel |
| Phase 1c — STT + TTS in the loop | **Agora provides this** — managed ASR (Deepgram nova-3) + TTS |
| Phase 1d — barge-in | **Agora provides this** — `metadata.interruptable` per response |
| Phase 3 — bidding + moderator | Working — `spike/orchestrator.js`, keyword bids, deck scenario reproduces |
| Phase 3 — real LLM bids | Keyword stub in place; swap `bid()` when `LLM_API_KEY` is set |
| Phase 5 — Claims Ledger | Working — `server/src/panel/ledger.ts`, contradiction + vague detection, wired into the live turn loop |

### What Agora's Conversational AI Engine hands us for free

Transport, speech-to-text, turn detection, text-to-speech, and barge-in. We only
write the orchestrator — it registers as a custom LLM (`llm.url`) and Agora calls
it after each candidate turn with OpenAI chat-completions.

Per-response control we use:
- `metadata.tts_params.params.voice_type` — the winning interviewer's voice
- `metadata.interruptable` — whether the candidate can cut this response off

One constraint this creates: Agora calls us **once per completed turn**, not on
partial transcripts. So the three agents bid and draft their reply in the *same*
parallel pass (one round trip), instead of bidding continuously as section 3
originally assumed. Continuous bidding is still possible later via the RTM
transcript stream, but is not needed for the demo.
| Phase 2 — shared model | Not started |
| Phase 3 — bidding | Not started |
| Phase 4 — integration | Not started |
| Phase 5 — claims ledger | Not started |
| Phase 6 — scorecard | UI done, not wired to real data |

**Next action:** Phase 1 kill test. Nothing else is worth starting first.
