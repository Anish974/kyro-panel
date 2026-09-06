# Kyro Panel

**Three AI interviewers on one voice call, arguing over who asks you next.**

🌐 **Live Deployment / Hosted App**: [https://kyro-panel.onrender.com/](https://kyro-panel.onrender.com/)

Built for EchoSphere: Agora Hackathon 2026 — track *Coordinated AI Interview Panel*.

A normal AI interviewer asks a question, waits, asks the next one. Kyro Panel puts
**three** interviewers in the room — a technical architect, a product manager and a
hiring manager. After every answer all three decide how badly they want to speak
next, and the one who wants it most takes the floor. They share one memory, so
nobody repeats a question and nobody misses a gap someone else spotted.

At the end you get three separate verdicts. **We never average them** — when the
panel disagrees, that disagreement is the most useful thing on the page.

---

## How an interview happens

Kyro Panel has two sides, and a landing page that asks which one you are.

**Hiring** — schedule an interview with a candidate name, a role, and the bar to
hold them to. You get a link. Scorecards come back to the same portal.

**Candidate** — open the invite link a company sent, or run a **mock interview**
to practise.

```
company     →  Schedule an interview  →  name · role · bar
                                      →  /?i=MY0W03

candidate   →  that link              →  role and bar already set
            or  mock interview        →  picks their own role and difficulty

both        →  interview ends         →  three verdicts, never averaged
```

**On an invite, the candidate never picks their own role or seniority.**
Experience level drives how hard the panel pushes, so letting the person being
graded choose it meant they set their own bar.

A mock is the exception, and only because nobody is hiring off it. Mock results
are marked as such and never appear in the company portal.

---

## Use the live app

**[kyro-panel.onrender.com](https://kyro-panel.onrender.com/)** — nothing to install.

**To try it in one minute** — press *Get started*, choose **Mock interview**,
pick a role and difficulty, allow the mic and talk.

**To see the hiring side** — press *I'm hiring*:

1. **Schedule an interview** — candidate name, role, experience bar.
2. Copy the invite link and open it (another tab is fine).
3. Allow the mic and talk. The panel joins on its own.

Scorecards from finished interviews are listed back on the portal. Mock
interviews are not — they are practice, not hiring data.

> Free Render instance: it sleeps after 15 idle minutes and the first request
> after that takes ~30 s to wake. The interview lives in memory, so a session
> does not survive a sleep — warm it up before a demo.

---

## Run it locally

Same app, but Agora runs in the cloud and cannot reach `localhost`, so the panel
needs a public tunnel back to your machine.

```bash
npm install
cp .env.example .env        # fill it in — see the comments inside
npm run dev                 # server on :8787, web on :3000
```

In a second terminal:

```bash
npm run tunnel              # prints a public https URL
```

Put that URL in `ORCHESTRATOR_URL` in `.env`, then restart `npm run dev`.

Open `http://localhost:3000` and take either path — mock interview, or schedule
one and open the invite link. Same flow as the hosted app.

```bash
npm run check -w server     # twelve self-checks, no network, no keys needed
```

> `cloudflared` prints a **new** hostname every restart. A stale
> `ORCHESTRATOR_URL` is the usual reason the panel joins but never speaks.

### Driving the agent by hand

The room starts and stops the panel itself. These are for when it does not, and
they tell you which credential is wrong:

```bash
npm run agent:dry                            # print the join request, send nothing
npm run agent:start                          # put the panel in the channel
npm run agent:stop -w server -- <agent_id>   # take it out
```

---

## What it looks like

**Company portal** — schedule an interview, then read the scorecards that come back.

![Company portal](web/public/screenshots/company-portal.png)

**The room** — three interviewers, live captions, and whoever currently holds the floor.

![Interview room](web/public/screenshots/room.png)

**Scorecard** — three separate verdicts, each quoting the candidate with a timestamp.

![Scorecard](web/public/screenshots/scorecard.png)

---

## The three interviewers

| Interviewer | Role | Cares about |
| :--- | :--- | :--- |
| **Arjun Mehta** | Technical Architect | Design quality, failure modes, does the thing actually work |
| **Ananya Shah** | Product Manager | Customer impact, business trade-offs, why does this matter |
| **Rohan Iyer** | Behavioural / HR | Ownership, how you take pushback, communication under pressure |

Defined once in [`shared/src/types.ts`](shared/src/types.ts) and nowhere else.

---

## How the pieces fit

```
  candidate's mic
        │
        ▼
  Agora Conversational AI Engine        turn detection · barge-in
   ├─ Deepgram nova-3   (ASR)          both in credential_mode: managed —
   └─ MiniMax           (TTS)          Agora authenticates and bills them
        │
        │  POST /chat/completions   ← once per completed answer
        ▼
  our server  ─────────────────────────────────────────────
   1. Claims Ledger reads the answer for contradictions
   2. one LLM call returns all three panelists' bids + replies
   3. highest bid takes the floor
   4. we stream that reply back, first chunk naming their voice
        │
        ├──► Agora speaks it in the winner's voice
        └──► SSE /events → the room UI updates live
```

The trick that makes this buildable: **three interviewers, one voice pipeline.**
One audio stream in, one out. The voice changes because the first SSE chunk we
send carries that panelist's `voice_type`.

---

## Repo layout

```
shared/          the contract both sides import — types only, no logic
  src/types.ts   Shared Candidate Model, panelists, events

server/
  src/index.ts   express app, route + auth wiring
  src/panel/     the brain: bidding, ledger, model, scorecard, personas, llm,
                 interviews (who set the bar), continuation (ASR resends)
  src/routes/    token · interviews · events + state + reset + scorecard ·
                 chat/completions · agent start/stop · auth
  src/checks/    self-checks — assert only, no framework, no network
  src/scripts/   agent.ts — puts the panel into an Agora channel by hand

web/
  src/screens/   Landing, CandidateEntry, CompanyPortal, Login, Room,
                 Deliberating, Scorecard
  src/components/ScheduleInterview, PanelistTile, BidRail
  public/screenshots/  the images this README and the landing page both use
  src/lib/       agora.ts (join as candidate), useSession.ts (SSE feed)

design/          UI mockups the screens were built from
docs/            architecture, workflow, decisions, and the submitted deck
```

Change a field in `shared/src/types.ts` and both server and web fail to compile.
That is the point — it is the only thing keeping two developers in sync.

---

## What is built

| | |
| :--- | :--- |
| Agora RTC tokens, agent start/stop | done |
| Custom-LLM endpoint with per-response voice switching | done |
| Bidding — all three panelists, one call per turn | done |
| Claims Ledger — contradictions, unquantified claims, corroboration | done |
| Role-play scenarios built from the candidate's own claims | done |
| Adaptive difficulty | done |
| Room screen, Evidence Scorecard | done |
| Landing page, company / candidate split | done |
| Company schedules the interview, candidate joins by invite link | done |
| Mock interviews, kept out of the company portal | done |
| Shared secret on every write | done |
| `/token` bound to the configured channel and non-reserved uids | done |
| Invite code enforced on `/agent/start` and `/scorecard` | not yet |
| Join + AI disclosure screen, device check | not yet |
| Deployment | done ([Live on Render](https://kyro-panel.onrender.com/)) |

Twelve self-check files, both workspaces typecheck clean.

---

## Two things to know before demoing

**Latency is ~1.4 s, not the 700 ms in the deck.** Measured: Agora transport RTT
82–104 ms, panel decision ~1350 ms. Splitting the call into two makes it worse
(1290 ms + 883 ms) because the cost is per-call overhead, not output length.
Streaming with the winner named first would get it to about 1 s. Details in
[`docs/decisions.md`](docs/decisions.md).

**Never deploy this to a serverless platform.** The Shared Candidate Model lives
in memory. A cold start loses the interview mid-sentence.

---

## Read next

| | |
| :--- | :--- |
| [`docs/architecture.md`](docs/architecture.md) | How it is put together, phase by phase, and why |
| [`docs/workflow.md`](docs/workflow.md) | The build order, the risks, and what each phase proves |
| [`docs/decisions.md`](docs/decisions.md) | What makes this different, track requirements, open items |
| [`docs/deck/`](docs/deck/) | The submitted idea submission |

---

## Team

| Name | Role | Owns |
| :--- | :--- | :--- |
| **Anish Patankar** | AI/ML Developer | Shared Candidate Model, bidding and turn-taking, Claims Ledger, contradiction detection |
| **Nidhi Dharme** | Full Stack Developer | Agora voice pipeline, panel room UI, backend integration, scorecard dashboard |

---

## Philosophy

An interview should find out what someone actually knows. A single AI asking
scripted questions cannot do that — it never notices the thing you avoided
saying. Three interviewers who share a memory and disagree in public can.

We do not average the verdicts, and we do not hide that the interviewers are AI.
The banner says so, on every screen.
