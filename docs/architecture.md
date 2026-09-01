# Kyro Panel — Project Brief & Roadmap

Everything you need to get up to speed and start building.
Team Kyro · EchoSphere: Agora Hackathon 2026 · Track: Coordinated AI Interview Panel

---

## 1. What we are building

A voice interview where **three AI interviewers argue about the candidate** instead of one bot scoring them.

The candidate joins a call. Three AI interviewers are already there — technical, product, and HR. The candidate talks out loud; the panel talks back. Either side can interrupt the other mid-sentence.

They are not three bots taking scripted turns. All three read and write **one shared set of notes**. After each answer, each interviewer scores how badly they want to speak next, and whoever cares most gets the floor.

At the end: a report that quotes the candidate. And when the three disagreed — which they usually do — **all three verdicts are kept instead of averaged into one number.**

### The example that explains it

A candidate explains a payment system using Redis and a queue. The architecture is genuinely good.

- A single bot marks it correct and moves on.
- Our panel does not: the **product** interviewer asks what a two-second delay does to a buyer staring at a checkout screen.

That question is the entire point of the project.

---

## 2. What the track requires

Eleven things must be demonstrable. Here is where each one lives.

| Required | How we do it | Status |
| :--- | :--- | :--- |
| Real-time, interruptible voice | Agora RTC + Conversational AI Engine | Transport verified |
| Multiple interviewer roles | Three personas, three prompts, three voices | Built |
| Shared candidate context | One `CandidateModel` object, no private memories | Built |
| Dynamic follow-up questions | Every question generated from current state | Stubbed |
| Controlled turn-taking | Bidding + moderator, one speaker at a time | Built |
| Role-play / scenario questions | Scenario injected and escalated live | **Weakest — needs design** |
| Difficulty adjustment | `difficulty` field, moves with performance | Built, not yet driven |
| Vague / contradictory answers | Claims Ledger | Not started |
| Evidence-linked feedback | Every rating stores its transcript line + timestamp | Types ready |
| Structured final assessment | Scorecard, three verdicts kept separate | Design done |
| Clear AI disclosure | Consent screen + persistent badge | Design done |

**Note on role-play:** it is claimed in the deck as a core feature with no mechanism anywhere. The track asks for it explicitly. Someone needs to design this — it is our biggest exposure.

---

## 3. How it actually works

```
Browser                    Agora Cloud                    Our Server
───────                    ───────────                    ──────────

candidate mic ──────────►  RTC transport
                           speech-to-text (Deepgram nova-3, managed by Agora)
                           turn detection
                                  │
                                  │  POST /chat/completions
                                  │  (OpenAI format, once per turn)
                                  └──────────────────────►  ┌──────────────────┐
                                                            │ Shared Candidate │
                                                            │ Model            │
                                                            │ skills · claims  │
                                                            │ difficulty·gaps  │
                                                            └────────┬─────────┘
                                                                     │ all three read
                                                       ┌─────────────┼─────────────┐
                                                       ▼             ▼             ▼
                                                   Technical      Product         HR
                                                       │             │             │
                                                       └── bid 0-1 ──┴─────────────┘
                                                                     │
                                                              highest bid wins
                                                                     │
                                  ◄──────────────────────────────────┘
                           text-to-speech                    SSE reply +
                           (winner's voice)                  voice in metadata
                                  │
candidate speaker ◄───────  RTC transport
```

### The insight that makes this buildable

**Three interviewers does not mean three voice pipelines.** The track itself demands controlled turn-taking — only one panelist speaks at a time, ever. So:

| Thing | How many |
| :--- | :--- |
| Audio in | **1** |
| Audio out | **1** |
| Agent brains | 3 — three prompts to one model |
| Voices | 3 — same TTS, different voice id |
| Shared model | **1** object |

### What Agora hands us for free

Transport, speech-to-text, turn detection, text-to-speech, and barge-in. We only write the orchestrator.

Our server registers as a **custom LLM** (`llm.url` in the agent config). Agora calls it after each candidate turn with OpenAI chat-completions and we stream back SSE. Two fields in the first chunk do a lot of work:

- `metadata.tts_params.params.voice_type` — the winning panelist's voice
- `metadata.interruptable` — whether the candidate can cut this response off

One constraint this creates: **Agora calls us once per completed turn, not on partial transcripts.** So the three panelists bid *and* draft their reply in the same parallel pass — one round trip of latency, not two.

---

## 4. What is already built and verified

| Piece | Status |
| :--- | :--- |
| Agora transport | ✅ Two clients in one channel, audio flows both ways, **RTT 82–104 ms** |
| Token minting | ✅ `GET /token` — App Certificate never leaves the server |
| Custom-LLM SSE endpoint | ✅ Correct metadata chunk, voice switching, streaming |
| Bidding + moderator | ✅ Deck's page-8 scenario reproduces at 0.95 |
| Shared Candidate Model | ✅ In memory, single source of truth |
| Live state to browser | ✅ SSE `/events` |
| Web app | 🟡 Scaffold harness only — shows live bids and state |
| Agent in the channel | ⬜ Blocked on Customer ID/Secret + a tunnel |
| Claims Ledger | ⬜ Types ready, logic not written |
| Real LLM bidding | ⬜ Keyword stub in place, swap when key arrives |
| The four screens | ⬜ Designed, not built |

**RTT 82–104 ms means transport uses ~12% of our 700 ms budget.** The rest is available for speech and thinking. Agora is not going to be the bottleneck.

---

## 5. Repo layout

```
kyro-panel/
├── shared/src/types.ts        THE CONTRACT — read this first
│
├── server/                    express + tsx, port 8787
│   └── src/
│       ├── index.ts           app, CORS, auth wiring
│       ├── routes/
│       │   ├── token.ts       Agora RTC tokens — the App Certificate lives here
│       │   ├── llm.ts         POST /chat/completions  ← Agora calls this
│       │   ├── events.ts      SSE /events, /state, /reset, /scorecard
│       │   └── auth.ts        shared secret on every write
│       ├── panel/
│       │   ├── model.ts       Shared Candidate Model
│       │   ├── bidding.ts     all three bids + replies, one call
│       │   ├── ledger.ts      Claims Ledger
│       │   ├── scorecard.ts   three verdicts, never averaged
│       │   ├── personas.ts    Arjun / Ananya / Rohan
│       │   └── llm.ts         one thin OpenAI-compatible call
│       ├── checks/            self-checks — assert only, no network
│       └── scripts/agent.ts   start / stop the Agora agent
│
├── web/                       vite + react + tailwind, port 3000
│   └── src/
│       ├── App.tsx            picks Room or Scorecard
│       ├── lib/               agora.ts (join), useSession.ts (SSE)
│       ├── screens/           Room · Scorecard
│       └── components/        PanelistTile · BidRail
│
├── design/                    UI mockups the screens were built from
├── docs/                      architecture · workflow · decisions · deck/
└── README.md                  entry point
```

### `shared/src/types.ts` is the most important file

It holds `CandidateModel`, `Bid`, `Claim`, `Scorecard`, `SessionEvent`, and the `PANEL` roster (names, voices, colours).

Both sides import it. **Rename a field and the other person's build breaks immediately** — instead of the two of us drifting apart for three days and finding out during integration. Do not redefine any of these shapes locally.

---

## 6. Getting it running

```bash
git clone <repo> && cd kyro-panel
npm install
```

Create `.env` in the root (it is gitignored — never commit it):

```
AGORA_APP_ID=8a2d37e3319f40ed99c103e973627aa2
AGORA_APP_CERTIFICATE=<ask Anish>
AGORA_CHANNEL=demo-channel

AGORA_CUSTOMER_ID=          # Agora console → RESTful API
AGORA_CUSTOMER_SECRET=      # same page
ORCHESTRATOR_URL=           # public tunnel URL, see below
```

Then:

```bash
npm run dev        # server :8787 + web :3000 together
npm run check      # bidding self-check — the deck scenario must reproduce
```

### Running the real agent

Agora runs in the cloud and **cannot reach localhost**, so the server needs a public URL:

```bash
npm run tunnel                        # prints https://xxx.trycloudflare.com
# put that in ORCHESTRATOR_URL in .env

npm run agent:start -w server -- --dry   # inspect the request, send nothing
npm run agent:start -w server            # actually start the panel
npm run agent:stop  -w server -- <id>    # stop it
```

### Security, briefly

- **App Certificate and Customer Secret are secrets.** Server only, never in browser code, never committed. `.gitignore` already covers `.env`.
- The browser only ever gets the App ID and a short-lived signed token.
- Before the repo goes public, regenerate the certificate in the Agora console.

---

## 7. Roadmap

Each phase has a **kill test**. If it fails, stop and fix before moving on.

### ✅ Phase 1a — Agora transport *(done)*
Two clients, one channel, audio both ways. RTT 82–104 ms.

### ✅ Phase 2 — Shared Candidate Model *(done)*
One object, typed in `shared/`. Skills, difficulty, claims, gaps, transcript.

### ✅ Phase 3 — Bidding and turn-taking *(done, keyword-based)*
Three panelists bid in parallel; highest score takes the floor.

> **Kill test — passing.** Candidate describes a payment queue with Redis. Technical bid stays low, product spikes to **0.95** because customer impact is missing. This is the deck's own headline scenario; if it stops reproducing, the bidding logic is wrong, not the test.

### ⬜ Phase 1b — Put the agent in the channel · **Nidhi** · next
Needs Customer ID/Secret and a tunnel. The REST call is already written.

> **Kill test:** speak into the channel and hear a panelist reply in their own voice. Measure real end-to-end latency and write the number down.

### ⬜ Phase 4 — Real LLM bidding · **Anish**
Replace `scoreBid` and the canned replies with one LLM call per panelist, all three in parallel. Same signatures, same return shapes.

> **Kill test:** the page-8 scenario still reproduces with a real model, and total latency stays under ~700 ms.

### ⬜ Phase 5 — The Room screen · **Nidhi**
Port `design/Main.dc.html` to React. Panelist tiles with speaking state, candidate video, live captions, and the right rail driven by `/events`.

> **Kill test:** a spectator watching for five seconds can tell who has the floor and why. The bid spike must be visible as it happens.

### ⬜ Phase 6 — Claims Ledger · **Anish**
Extract factual claims per answer, compare against earlier ones, mark verified / vague / contradicted. Run it after the interview first; live only if there is latency headroom.

> **Kill test:** say "we had zero downtime" early and "the queue backed up for an hour" later. The ledger catches it and cites both timestamps.

### ⬜ Phase 7 — Scorecard · **Nidhi**
No real-time work. Three verdicts side by side with quotes. **Do not average the scores** — the preserved disagreement is the product. Layout already designed.

> **Kill test:** every number on the page traces to a specific quote with a timestamp.

### ⬜ Phase 8 — Role-play scenarios · **unassigned**
The track requires it and we have no mechanism. Needs a design before it needs code.

### ⬜ Phase 9 — Deploy
- `web/` → static build → Vercel or Netlify
- `server/` → **Render or Railway**

> ⚠️ **Do not put the server on serverless.** The Shared Candidate Model lives in memory. A cold start mid-interview loses the candidate's entire context and the differentiator dies with it.

---

## 8. Who owns what

| | **Anish** | **Nidhi** |
| :--- | :--- | :--- |
| Owns | Shared model, bidding, moderator, Claims Ledger | Agora pipeline, room UI, scorecard UI |
| Phases | 2 ✅, 3 ✅, 4, 6 | 1a ✅, 1b, 5, 7 |
| Works in | `server/src/panel/` | `web/src/`, `server/src/scripts/` |
| Blocked by voice? | **No** — test against a hardcoded transcript | — |

The two tracks stay independent. Anish should never wait on the voice pipeline; Nidhi should never wait on bidding logic. That is the entire point of the split.

**Agree any change to `shared/src/types.ts` with the other person before pushing it.**

---

## 9. The demo, in order

1. Join screen — AI disclosure and consent *(4 seconds, do not linger)*
2. Candidate answers a system-design question
3. Technical interviewer accepts it
4. **Right rail updates live: gap flagged, product bid spikes to 0.95**
5. Product interrupts and challenges on customer impact
6. Candidate contradicts an earlier claim — the ledger flags it live
7. Scorecard: technical says hire, product says no hire, both with quotes

**Step 4 wins or loses this.** Every UI decision exists to make that one state change visible to someone watching a screen for five seconds.

---

## 10. Open items

Places where the deck, the code, and reality disagree. Worth fixing before the next submission.

1. ~~**Interviewer names.**~~ Settled. `shared/src/types.ts` is the only place they are defined.
2. ~~**Product name.**~~ Settled: **Kyro Panel**. "Huddle Panel" is gone from the code and the design mockups; the deck's body text and page-10 mockup still say it.
3. **Placeholder in the deck.** Page 1 still reads `<Write your Team Name>vv`.
4. ~~**Rohan's role.**~~ Settled: **Behavioural / HR**. The mockups that said "Hiring Manager" were changed to match `shared/src/types.ts`.
5. ~~**Transport was never committed to.**~~ Settled: Agora, and Agora is mandatory for this track. The deck's slash-list should go.
6. **Latency number — now measured, and it does not match.** Deck says 700 ms. Transport RTT is 82–104 ms, but the panel decision itself is ~1350 ms (one Gemini flash-lite call for all three panelists), so end to end is about **1.4 s** on a direct connection and 1.9–2.8 s through the dev tunnel. Either the deck's number changes or the pipeline gets faster. Do not present 700 ms as achieved.
7. ~~**Stack line.**~~ Settled, and the README now says it: we run no speech pipeline. Agora's Conversational AI Engine supplies turn detection, barge-in, Deepgram nova-3 ASR and MiniMax TTS, both in `credential_mode: managed` — Agora authenticates and bills them, and we hold neither key. Deck page 11 still describes a Deepgram + Cartesia pipeline we run ourselves; that line needs replacing.
8. ~~**Role-play has no mechanism.**~~ Built. A panelist opens a scenario from something the candidate already claimed; one at a time, closed after three answers. See `openScenario` in `server/src/panel/model.ts`.

9. ~~**`legacy/` still used the old names.**~~ Deleted. It was the archived first prototype and nothing imported it; `git log` still has every line of it.

---

## 11. Reference

- **Build plan, phase by phase** — [`workflow.md`](workflow.md)
- **Repo overview** — [`README.md`](../README.md)
- **The contract** — [`shared/src/types.ts`](../shared/src/types.ts)
- Agora: [start an agent](https://docs.agora.io/en/conversational-ai/rest-api/agent/join) · [custom LLM](https://docs.agora.io/en/conversational-ai/develop/custom-llm) · [live transcripts](https://docs.agora.io/en/conversational-ai/develop/transcripts)

---

## Philosophy

**Depth over breadth.** One interview experience that genuinely listens, adapts, challenges and evaluates — instead of ten features that each work alone.

**One interview. Multiple perspectives. One evidence-backed view of the candidate.**
