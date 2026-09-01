# Decisions, differentiators and open items

Why Kyro Panel is built the way it is, which track requirement each piece
answers, and what is still inconsistent between the code and the submitted
deck. The short version lives in the [README](../README.md).

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
9. ~~**`legacy/` still used the old names.**~~ Deleted — nothing imported it,
   and `git log` still has every line.

---

