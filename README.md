# Kyro Panel

**An AI interview where three interviewers argue about you instead of one bot scoring you.**

> EchoSphere: Agora Hackathon 2026 — Round II
> Track: Coordinated AI Interview Panel
> Team Kyro — Anish Patankar, Nidhi Dharme

---

## What this is, in plain words

You join a video call. Three AI interviewers are already there — a technical
person, a product person, and an HR person. You talk out loud. They talk back.
You can cut them off mid-sentence, and they can cut you off too.

They are not three separate bots taking turns from a script. They all read and
write to **one shared set of notes** about you. When you answer, each of them
decides how badly they want to speak next, and whoever cares most gets the floor.

At the end you get a report that quotes you. And if the three of them disagreed
about you — which they usually do — **the report keeps all three opinions instead
of averaging them into one meaningless number.**

---

## The problem we are solving

Real companies use interview panels for a reason. A tech lead notices bad
architecture. A product manager notices you never mentioned the customer. An HR
lead notices how you handle being challenged. Three people catch three different
things.

Today's AI interview tools flatten all of that into one bot asking eight scripted
questions and printing a single score. You lose the follow-ups, you lose the
interruptions, and you lose the disagreement — which is often the most useful
signal in the whole interview.

**Example.** A candidate explains a payment system using Redis and a queue. The
architecture is genuinely good. A single bot marks it correct and moves on. A real
panel does not: the product person asks what a two-second delay does to a buyer
staring at a checkout screen. That question is the entire point, and today's tools
never ask it.

---

## How it works

**1. You answer a question out loud.**
Your voice streams to the server and gets turned into text as you speak — not
after you finish.

**2. All three interviewers read your answer at the same time.**
Not one after another. All three, simultaneously, from the same shared notes.

**3. Each one bids for the floor.**
Every interviewer scores 0 to 1 on how much they want to speak next. Talk about
databases and the technical bid spikes. Skip the customer entirely and the product
bid spikes instead. A moderator gives the floor to the highest bid.

**4. That bidding happens while you are still talking.**
So by the time you stop, the next speaker is already chosen and can reply
instantly. It also means an interviewer can interrupt you mid-sentence when
something they care about comes up — exactly like a real panel.

**5. Everything you claim gets written down and cross-checked.**
Say "we had zero downtime" in minute 4 and "the queue backed up for an hour" in
minute 11, and the system notices. Say "we made it much faster" without a number,
and it marks that as vague.

**6. The difficulty moves with you.**
Answer well and the questions get harder. Struggle and they ease off.

**7. You get a report with receipts.**
Every rating points at the exact sentence you said and the timestamp you said it.
No score exists that we cannot show you the quote for.

---

## The three interviewers

| Interviewer | Role | Cares about |
| :--- | :--- | :--- |
| **Arjun Mehta** | Technical Architect | Design quality, failure modes, does the thing actually work |
| **Ananya Shah** | Product Manager | Customer impact, business trade-offs, why does this matter |
| **Rohan Iyer** | Behavioural / HR | Ownership, how you take pushback, communication under pressure |

These names live in `shared/src/types.ts` and nowhere else. The old prototype
called them Alex, Sarah and David; that prototype is now in `legacy/` and the
deck's names won.

---

## What makes this different

Most of the feature list is required by the track. These three are ours.

### 1. One shared brain, not three memories

There is a single object called the **Shared Candidate Model**. It holds your
skill scores, the current difficulty level, every claim you have made, and every
gap the panel has noticed. All three interviewers read from it and write to it.

This is why the product interviewer knows the technical interviewer already
approved your architecture, and can go straight to attacking the part nobody
covered.

### 2. Interviewers bid to speak

Nobody takes fixed turns. Each interviewer continuously scores how relevant your
current answer is to what they care about, and the highest score gets the floor.
This is what makes the panel feel alive instead of scripted — and it is what makes
natural interruption possible.

### 3. A Claims Ledger that catches contradictions

Every factual statement you make is stored with a timestamp and compared against
everything you said earlier. Each claim ends up marked as:

- **verified** — held up under follow-up questions
- **vague** — no numbers, no specifics, dodged twice
- **contradicted** — conflicts with something you said earlier

### And the report keeps the disagreement

Three verdicts, side by side, each with its own quotes. If the technical
interviewer says hire and the product interviewer says no hire, you see both, plus
exactly which answers each of them is standing on. **A hiring manager learns more
from that split than from a 3.4 out of 5.**

---

## What is in this repo right now

```
kyro-panel/
├── index.html      Clickable demo of all 4 screens  ← SIMULATED, not real AI
├── design/         Source design files for the 4 screens
├── workflow.md     The build plan — read this before writing code
├── README.md       This file
└── Kyro_EchoSphere2026_IdeaSubmission (1).pdf    The submitted deck
```

### About `index.html` — please read this

It is a **UI prototype**, not the product. It shows what the finished thing looks
like and how the screens flow, using:

- the browser's built-in speech synthesis for the three voices (pitch-shifted, not
  real persona voices)
- the browser's built-in speech recognition for input
- **scripted answers and fake bid numbers**

There is **no Agora, no real speech engine, no LLM and no backend in it.** Nothing
in it is talking to a real model. It exists to demo the interface and to agree on
the design — the real system is still to be built, starting at Phase 1 in
[`workflow.md`](workflow.md).

### Run it

```bash
npm run dev      # serves on http://localhost:3000
```

Any static file server works. Open it in Chrome — the speech APIs it uses are not
supported everywhere.

---

## Architecture

```
Browser                Server                        Services
───────                ──────                        ────────

your mic ──► Agora RTC ──► streaming STT ────────► text (while you speak)
                                                        │
                                                        ▼
                                        ┌───────────────────────────┐
                                        │  Shared Candidate Model   │
                                        │  skills · claims ·        │
                                        │  difficulty · gaps        │
                                        └───────────┬───────────────┘
                                                    │ all three read + write
                                    ┌───────────────┼───────────────┐
                                    ▼               ▼               ▼
                                 Technical       Product           HR
                                    │               │               │
                                    └─── bid 0-1 ───┴───────────────┘
                                                    │
                                                    ▼
                                            highest bid gets
                                              the floor
                                                    │
                                                    ▼
your speaker ◄── Agora RTC ◄── TTS in that interviewer's voice ◄──┘
```

**Key point:** three interviewers, but only **one** audio stream in and **one**
out — because only one person speaks at a time. The three "interviewers" are three
prompts to one fast model, not three separate voice pipelines. This is what keeps
the whole thing buildable in a hackathon.

---

## Tech stack

| Layer | Choice | Why |
| :--- | :--- | :--- |
| Voice + video transport | **Agora RTC** | Mandatory for this track, and it handles the hard real-time parts |
| Turn-taking, ASR, TTS | **Agora Conversational AI Engine** | Supplies turn detection, barge-in and managed ASR/TTS, so we never run a speech pipeline ourselves |
| Speech to text | **Deepgram nova-3**, `credential_mode: managed` | Agora authenticates and bills it — we hold no Deepgram key |
| Text to speech | **MiniMax**, `credential_mode: managed` | Per-response `voice_type` is what gives three voices on one pipeline |
| Panel brain | **Gemini flash-lite**, one call per turn | We stand in as Agora's "custom LLM"; see below |
| Frontend | Vite + React + TypeScript + Tailwind | |
| Server | Node + TypeScript + Express, long-running | The candidate model is in memory — see the deployment warning |

### Three interviewers, one voice pipeline

This is the thing that makes the project buildable. There is **one** audio stream
in and **one** out. Agora calls our `/chat/completions` once per completed turn;
we decide who speaks, and the first SSE chunk carries that panelist's
`voice_type`. Agora's TTS switches voice per response. Three interviewers, one
pipeline.

### Why not a native speech-to-speech model?

It would give better audio and free interruption handling, but it does not hand
us clean text — and **without text there is no bidding and no Claims Ledger**,
which is the entire reason this project exists.

### Latency — measured, not claimed

The deck says **under 700ms**. What we actually measure today:

| Segment | Measured |
| :--- | :--- |
| Agora transport RTT | 82–104 ms |
| Panel decision (one Gemini flash-lite call, all three panelists) | ~1350 ms |
| Same call through a cloudflared tunnel | 1.9–2.8 s |

So the honest number is **about 1.4 s on a direct connection**, not 700 ms. The
tunnel is a development detail and disappears on a real host. Closing the rest
means a faster model or streaming the winner's reply as it generates — the bid
has to finish before anyone can speak, so that part is not parallelisable.

---

## Track requirements — where each one is handled

| Required | How |
| :--- | :--- |
| Real-time, interruptible voice | Agora RTC + voice activity detection kills playback on barge-in |
| Multiple interviewer roles | Three personas, three prompts, three voices |
| Shared candidate context | One Shared Candidate Model object, no private memories |
| Dynamic follow-up questions | Every question generated from current state, no question bank |
| Controlled turn-taking | Bidding + moderator, only one speaker ever holds the floor |
| Role-play / scenario questions | Scenario injected into the prompt and escalated live *(weakest area — needs design work)* |
| Difficulty adjustment | `difficulty` field in the shared model, moves with performance |
| Vague / contradictory answers | Claims Ledger |
| Evidence-linked feedback | Every rating stores the transcript line and timestamp it came from |
| Structured final assessment | Scorecard screen, three verdicts kept separate |
| Clear AI disclosure | Consent screen before joining + a persistent badge in the room |

---

## Build status

| Phase | Status |
| :--- | :--- |
| Design — 4 screens | ✅ Done |
| Clickable UI prototype | ✅ Done — simulated only |
| Phase 1 — voice pipeline + barge-in | ⬜ Not started |
| Phase 2 — Shared Candidate Model | ⬜ Not started |
| Phase 3 — bidding + moderator | ⬜ Not started |
| Phase 4 — integration, three voices | ⬜ Not started |
| Phase 5 — Claims Ledger | ⬜ Not started |
| Phase 6 — scorecard on real data | ⬜ UI done, not wired |

**Next action:** Phase 1 in [`workflow.md`](workflow.md) — one agent, real voice,
real interruption. If that does not work, nothing else matters.

---

## Known inconsistencies

Open items where the deck, the README and the code disagree. Fix before the next
submission.

**Decided — the code and the design files already follow this. Only the deck
still needs editing:**

1. ~~**Interviewer names.**~~ Arjun Mehta / Ananya Shah / Rohan Iyer, defined
   once in `shared/src/types.ts`. The design mockups were renamed to match.
2. ~~**Product name.**~~ **Kyro Panel.** "Huddle Panel" is gone from the code
   and the mockups; the deck's body text and page-10 mockup still say it.
3. ~~**Rohan's role.**~~ **Behavioural / HR**, not "hiring manager". The track
   treats those as different roles, so it had to be one of them.
4. ~~**Transport.**~~ Agora, and only Agora — it is mandatory for this track.
   The deck's "WebRTC / Agora RTC / LiveKit" line should say Agora RTC.
5. ~~**Stack.**~~ We do not run a speech pipeline. Agora's Conversational AI
   Engine supplies turn detection, barge-in, Deepgram ASR and MiniMax TTS, both
   in `credential_mode: managed` — Agora authenticates and bills them, and we
   hold neither key. Deck page 11 still describes a Deepgram + Cartesia pipeline
   we run ourselves.
6. ~~**Role-play questions claimed with no mechanism.**~~ Built. A panelist may
   open a scenario from something the candidate already claimed; one runs at a
   time and closes after three answers. See `openScenario` in
   `server/src/panel/model.ts`.

**Still open:**

7. **Placeholder left in the deck.** Page 1 still reads
   `<Write your Team Name>vv`.
8. **Latency number.** The deck says 700ms. Measured is ~1.4 s — see
   [Latency](#latency--measured-not-claimed). Either the deck changes or the
   pipeline gets faster; do not present 700 ms as achieved.
9. **`legacy/index.html` still uses the old names.** It is the archived first
   prototype and nothing imports it. Left alone deliberately; delete it if the
   drift is more confusing than the history is worth.

---

## Team

| Name | Role | Owns |
| :--- | :--- | :--- |
| **Anish Patankar** | AI/ML Developer | Shared Candidate Model, bidding and turn-taking, Claims Ledger, contradiction detection |
| **Nidhi Dharme** | Full Stack Developer | Agora voice pipeline, panel room UI, backend integration, scorecard dashboard |

---

## Our philosophy

**Depth over breadth.** One interview experience that genuinely listens, adapts,
challenges and evaluates — instead of ten features that each work alone.

**One interview. Multiple perspectives. One evidence-backed view of the candidate.**
