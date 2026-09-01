import { PANEL, type Bid, type PanelistId, type TurnDecision } from '@kyro/shared';
import { SIGNALS, SYSTEM_PROMPTS } from './personas.js';
import { LLM_ENABLED, ask, parseJson } from './llm.js';
import * as model from './model.js';

export const CUSTOMER_GAP = 'customer impact not addressed';

// All three panelists bid on the same answer, in parallel, and each drafts its
// reply in the same pass. One round trip of latency, not two — see workflow.md
// section 3 for why this matters to the 700ms budget.
//
// With a key configured each panelist is a real LLM call. Without one, the
// keyword scorer below runs instead, so the Agora contract stays testable
// offline and the self-checks never touch the network.

const FALLBACK_REPLIES: Record<PanelistId, string> = {
  technical: 'Walk me through what happens to that design when the primary goes down mid-write.',
  product:
    'That queue absorbs the write spike, but a two-second delay on checkout confirmation is a refund ticket. How did you decide that trade was acceptable?',
  hr: 'Looking back at that tradeoff, what would you have done differently if you were leading the team?',
};

interface Draft {
  score: number;
  reason: string;
  intent: Bid['intent'];
  reply: string;
  /** 0-1: how strong that answer was on this panelist's own axis. */
  quality: number;
  /** Set only when this panelist wants to open a role-play. */
  scenario?: string;
}

/** A role-play runs for this many candidate answers, then the panel moves on. */
const SCENARIO_LENGTH = 3;

/** Nothing to role-play about until the candidate has said enough to build on. */
const SCENARIO_EARLIEST_TURN = 3;

/** A role-play needs material to be built from, and room to actually run. */
function canOpenScenario(): boolean {
  const m = model.getModel();
  return !m.scenario && m.turns >= SCENARIO_EARLIEST_TURN;
}

/** What every panelist is told about the interview so far. */
function context(answer: string): string {
  const m = model.getModel();
  const canOpen = canOpenScenario();
  const recent = m.transcript
    .slice(-6)
    .map(t => `${t.speaker === 'candidate' ? 'CANDIDATE' : t.speaker.toUpperCase()}: ${t.text}`)
    .join('\n');

  return [
    `The candidate just said: "${answer}"`,
    '',
    'Recent exchange:',
    recent || '(nothing yet — this is the opening)',
    '',
    `Competency scores so far (0-1): ${JSON.stringify(m.skills)}`,
    `Open gaps the panel noticed: ${m.gaps.length ? m.gaps.join('; ') : 'none'}`,
    `Who spoke last: ${m.lastSpeaker ?? 'nobody'}`,
    `Question ${m.turns} of about 10. Difficulty level ${m.difficulty} of 5 — level 1 is a`,
    'warm-up, level 5 is a staff engineer being pushed on the hardest part of their answer.',
    'Pitch what you ask at that level.',
    '',
    m.scenario
      ? [
          `ROLE-PLAY RUNNING (answer ${m.scenario.turns + 1} of ${SCENARIO_LENGTH}), opened by ${m.scenario.openedBy}:`,
          `"${m.scenario.premise}"`,
          'Stay inside it. Press on what they would actually do, step by step.',
          'Do not start another one.',
        ].join('\n')
      : canOpen
        ? [
            'No role-play is running, and you may start one. Put the candidate inside a',
            'concrete situation built from something they have ALREADY claimed — their own',
            'system, their own decision — and ask what they do. Only if it would tell you',
            'more than another question would.',
          ].join('\n')
        : '',
    '',
    'Decide how badly you want to speak next, then write what you would say.',
    'Reply with JSON only:',
    '{"score": 0.0-1.0, "reason": "under 10 words, why you want the floor",',
    ' "intent": "probe"|"challenge"|"followup"|"handoff", "reply": "what you say, max 2 sentences",',
    // Left unanchored, every panelist rates everything about 0.5 and the
    // difficulty never moves. Give the scale fixed points.
    ' "quality": how strong that answer was on YOUR axis — 0.2 evasive or "I don\'t' +
      ' know", 0.5 correct but thin, 0.8 a strong senior answer with specifics,' +
      ' 1.0 could not be answered better' +
      (canOpen ? ',' : ''),
    canOpen ? ' "scenario": "one-line premise — ONLY if you are opening a role-play"' : '',
    '}',
    '',
    'Score low if another panelist is better placed, or if you just spoke.',
    'If the candidate said nothing intelligible, score low and ask them to repeat.',
  ]
    .filter(Boolean)
    .join('\n');
}

// One call carries all three panelists rather than three calls in parallel.
// Measured at 1354ms against 1387ms — the same wall clock for a third of the
// quota, which matters on a free tier that rate-limits per minute.
const PANEL_PROMPT = `You run a three-person interview panel. Each member is a different
person with their own axis, and they do not share an opinion.

ARJUN (technical): ${SYSTEM_PROMPTS.technical}

ANANYA (product): ${SYSTEM_PROMPTS.product}

ROHAN (hr): ${SYSTEM_PROMPTS.hr}

Score each one INDEPENDENTLY, as that person, on their own axis only. They must
not agree by default: if all three scores land within 0.1 of each other you have
not done the job. A panel where everyone always wants the floor is not a panel.

Never repeat a question that already appears in the recent exchange.
Each reply speaks to the candidate directly — no stage directions, no preamble,
no name tags.

Answer with one JSON object keyed by panelist:
{"technical": {...}, "product": {...}, "hr": {...}}`;

function coerce(id: PanelistId, raw: Partial<Draft> | undefined): Draft {
  if (!raw?.reply) throw new Error(`${id} returned no usable draft`);
  return {
    score: Math.max(0, Math.min(1, Number(raw.score) || 0)),
    reason: String(raw.reason ?? '').slice(0, 80) || 'wants the floor',
    intent: (['probe', 'challenge', 'followup', 'handoff'] as const).includes(raw.intent as never)
      ? (raw.intent as Bid['intent'])
      : 'probe',
    reply: String(raw.reply).slice(0, 400),
    // `Number(undefined)` is NaN, and `NaN ?? 0.5` is still NaN — ?? only
    // catches null and undefined. An unguarded NaN here poisons the average
    // and the difficulty silently never moves.
    quality: Number.isFinite(Number(raw.quality))
      ? Math.max(0, Math.min(1, Number(raw.quality)))
      : 0.5,
    scenario: raw.scenario ? String(raw.scenario).slice(0, 300) : undefined,
  };
}

type PanelDrafts = Partial<Record<PanelistId, Partial<Draft>>>;

/** All three panelists, one round trip. Throws if the call or the JSON fails. */
async function draftPanel(answer: string): Promise<Record<PanelistId, Draft>> {
  const raw = parseJson<PanelDrafts>(await ask(PANEL_PROMPT, context(answer), 700));
  if (!raw) throw new Error('panel returned no parsable JSON');
  return {
    technical: coerce('technical', raw.technical),
    product: coerce('product', raw.product),
    hr: coerce('hr', raw.hr),
  };
}

/** Keyword scorer. Used when no LLM key is set, and when a call fails. */
function draftWithKeywords(id: PanelistId, answer: string, gapIsNew: boolean): Draft {
  const hits = (answer.match(new RegExp(SIGNALS[id].source, 'gi')) ?? []).length;
  let score = Math.min(0.15 + hits * 0.3, 0.9);
  let reason = hits ? `${hits} signal${hits > 1 ? 's' : ''} in the last answer` : 'nothing to pick up on';

  // The deck's headline scenario: a technical answer that never mentions the
  // customer is exactly when product should take the floor.
  //
  // The spike only fires on a NEWLY spotted gap. Once product has already
  // challenged on it, a standing gap is no longer news — otherwise product
  // wins every remaining turn and the panel stops feeling like a panel.
  if (id === 'product' && gapIsNew) {
    score = 0.95;
    reason = 'infrastructure described, customer impact never mentioned';
  }

  const intent: Bid['intent'] = score >= 0.9 ? 'challenge' : id === 'hr' ? 'followup' : 'probe';
  return {
    score: Math.round(score * 100) / 100,
    reason,
    intent,
    reply: FALLBACK_REPLIES[id],
    // Keywords cannot judge an answer, so they must not move the difficulty.
    quality: 0.5,
  };
}

/** Run the panel on one candidate answer and decide who speaks next. */
export async function runPanel(answer: string): Promise<TurnDecision> {
  model.addTurn({ speaker: 'candidate', text: answer });

  // Work out the gap before bidding — whether it is NEW is what product bids on.
  const technical = SIGNALS.technical.test(answer);
  const mentionsCustomer = SIGNALS.product.test(answer);
  const gapIsNew = technical && !mentionsCustomer && !model.hasGap(CUSTOMER_GAP);

  let panel: Record<PanelistId, Draft> | null = null;
  if (LLM_ENABLED) {
    try {
      panel = await draftPanel(answer);
    } catch (err) {
      // A slow or malformed call must not take the interview down with it.
      console.warn('panel fell back to keywords:', (err as Error).message);
    }
  }

  const drafts = PANEL.map(
    p => [p.id, panel?.[p.id] ?? draftWithKeywords(p.id, answer, gapIsNew)] as const,
  );
  const byId = new Map(drafts);

  const bids: Bid[] = drafts
    .map(([id, d]) => ({
      panelist: id,
      // Nobody holds the floor twice running unless they really want it.
      score:
        model.lastSpeaker() === id ? Math.max(0, Math.round((d.score - 0.3) * 100) / 100) : d.score,
      reason: model.lastSpeaker() === id ? `${d.reason} (just spoke)` : d.reason,
      intent: d.intent,
    }))
    .sort((a, b) => b.score - a.score);

  const winner = bids[0].panelist;

  if (technical) {
    model.nudgeSkill('systemDesign', 0.8);
    if (!mentionsCustomer) {
      model.nudgeSkill('customerImpact', 0.2);
      model.addGap(CUSTOMER_GAP);
    } else {
      model.nudgeSkill('customerImpact', 0.75);
    }
  }

  // Difficulty follows the panel's own read of the answer, not a keyword count.
  // Three quiet nudges rather than one loud jump: a candidate who has a bad
  // minute should not be dropped two levels for it.
  const quality = drafts.reduce((sum, [, d]) => sum + d.quality, 0) / drafts.length;
  if (quality >= 0.62) model.adjustDifficulty(1);
  else if (quality <= 0.4) model.adjustDifficulty(-1);
  console.log(`  quality ${quality.toFixed(2)} -> difficulty L${model.getModel().difficulty}`);

  // A role-play ends on a count, not on the panel's mood — otherwise it either
  // never closes or gets abandoned halfway.
  if (model.scenario()) {
    model.advanceScenario();
    if (model.scenario()!.turns >= SCENARIO_LENGTH) model.closeScenario();
  } else if (byId.get(winner)!.scenario) {
    model.openScenario(byId.get(winner)!.scenario!, winner);
  }

  const reply = byId.get(winner)!.reply;
  model.addTurn({ speaker: winner, text: reply });

  return { bids, winner, reply, interruptable: true };
}
