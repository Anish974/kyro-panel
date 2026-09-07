import type { Claim, ClaimStatus } from '@kyro/shared';
import * as model from './model.js';
import { continues } from './continuation.js';

// Claims Ledger — catches vague and contradictory answers.
//
// Every factual statement the candidate makes is stored with a timestamp and
// checked against everything said earlier. Three outcomes: vague (no numbers
// behind a magnitude word), contradicted (conflicts with an earlier claim), or
// open (nothing wrong with it yet).
//
// ponytail: heuristic extraction so the ledger runs with zero API keys and
// stays testable. Replace extractClaims() with an LLM extraction call — same
// signature, same return shape — when LLM_API_KEY is set. The concept map
// below is the part an LLM removes the need for.

/** Topics that mean the same thing for contradiction purposes. */
const CONCEPTS: Record<string, RegExp> = {
  availability: /\b(downtime|outage|unavailab\w*|offline|backed up|backlog|stalled|dropped requests?)\b/i,
  latency: /\b(latenc\w*|slow\w*|delay\w*|lag|response times?|p99|p95)\b/i,
  errors: /\b(errors?|failures?|bugs?|incidents?|data loss)\b/i,
  scale: /\b(traffic|load|throughput|qps|rps|requests per second)\b/i,
};

/** "zero downtime", "no errors", "never went down". */
const ABSOLUTE_NONE = /\b(zero|no|none|never|without any|not a single|didn'?t have any)\b/i;

/** Any actual quantity: a number, or a spelled-out duration. */
const QUANTITY =
  /\b(\d+(\.\d+)?\s*(ms|s|sec\w*|min\w*|hours?|hrs?|days?|%|k|m|x)?|an? (hour|minute|day|week)|a (couple|few))\b/i;

/** Magnitude words that mean nothing without a number attached. */
const MAGNITUDE =
  /\b(massive\w*|huge\w*|drastic\w*|significant\w*|way (faster|better|slower)|much (faster|better)|a lot|lots|tons|plenty|tremendous\w*|dramatic\w*)\b/i;

// Deciding what counts as a claim: exclude the things that clearly are not,
// rather than whitelisting verbs. A whitelist misses every verb nobody thought
// of ("throttled", "backpressured") and silently drops the claim.
const NOT_A_CLAIM =
  /^\s*(that'?s?|that is|yeah|yes|nope|sure|ok(ay)?|i think|i guess|maybe|fair enough|good point|right|exactly|agreed|hello|hi|hey|can you hear|i can.*hear|i have heard|i'?ve been (there|doing|saying)|sounds? good|you (are|'?re) not audible|sir,? you are not audible|not audible|can'?t hear|cannot hear|audio|sound check|mic check)\b/i;

/** Someone doing something — the subject of a checkable statement. */
const SUBJECT = /\b(we|i|our|us|my|the team|it|they)\b/i;

function isClaim(sentence: string): boolean {
  if (sentence.trim().endsWith('?')) return false;
  if (NOT_A_CLAIM.test(sentence)) return false;
  // Ignore conversational fragments under 25 chars unless they mention a concept or number
  if (sentence.length < 25 && conceptOf(sentence) === null && !QUANTITY.test(sentence)) {
    return false;
  }
  // Checkable if someone acted, a tracked concept came up, or a number was given.
  return SUBJECT.test(sentence) || conceptOf(sentence) !== null || QUANTITY.test(sentence);
}

interface Extracted {
  text: string;
  concept: string | null;
  none: boolean;
  quantified: boolean;
  vague: boolean;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\s+(?:but|however|although|though)\s+/i)
    .map(s => s.trim())
    .filter(s => s.length > 12);
}

function conceptOf(sentence: string): string | null {
  for (const [name, re] of Object.entries(CONCEPTS)) {
    if (re.test(sentence)) return name;
  }
  return null;
}

function analyse(sentence: string): Extracted {
  const quantified = QUANTITY.test(sentence);
  return {
    text: sentence,
    concept: conceptOf(sentence),
    none: ABSOLUTE_NONE.test(sentence),
    quantified,
    // A magnitude word with no number behind it is the classic dodge.
    vague: MAGNITUDE.test(sentence) && !quantified,
  };
}

/**
 * Read one candidate answer into the ledger.
 * Returns only the claims this answer created or changed, so the caller can
 * push them to the UI without resending the whole ledger.
 */
export function ingest(answer: string): Claim[] {
  const touched: Claim[] = [];

  for (const sentence of sentences(answer)) {
    if (!isClaim(sentence)) continue;

    // Deduplication. Exact matches are the easy half; the half that mattered
    // is the growing one. ASR sends a long answer as several turns that each
    // repeat everything said so far (continuation.ts), and because it supplies
    // no full stops, sentences() hands the whole utterance back as one
    // "sentence" a few words longer every time — so an exact-match check never
    // fires and one statement lands in the ledger four times.
    const existing = model.getModel().claims;
    if (existing.some(c => c.text.toLowerCase().trim() === sentence.toLowerCase().trim())) {
      continue;
    }

    // Same statement, caught further along: replace it rather than add a second
    // copy. The claim keeps its id, so the room updates the card it already
    // drew instead of growing a duplicate beside it.
    const grew = existing.find(c => continues(c.text, sentence));
    if (grew) {
      const updated = model.updateClaim(grew.id, { text: sentence });
      if (updated) touched.push(updated);
      continue;
    }

    // The reverse: the longer text is already on file, and this turn arrived
    // truncated. Nothing to add.
    if (existing.some(c => continues(sentence, c.text))) continue;

    const found = analyse(sentence);
    let status: ClaimStatus = 'open';
    let note: string | undefined;
    let conflictsWith: string | undefined;

    if (found.vague) {
      status = 'vague';
      note = 'magnitude claimed with no number behind it';
    }

    // Contradiction: an earlier claim said "none of X", this one puts a
    // quantity on X — or the other way round.
    if (found.concept) {
      const earlier = model
        .getModel()
        .claims.find(c => c.status !== 'contradicted' && conceptOf(c.text) === found.concept);

      if (earlier) {
        const earlierNone = ABSOLUTE_NONE.test(earlier.text);
        const earlierQuantified = QUANTITY.test(earlier.text);
        const conflict =
          (earlierNone && !found.none && found.quantified) ||
          (found.none && !earlierNone && earlierQuantified);

        if (conflict) {
          status = 'contradicted';
          conflictsWith = earlier.id;
          note = `conflicts with "${earlier.text}"`;
          const updated = model.updateClaim(earlier.id, {
            status: 'contradicted',
            note: 'contradicted by a later answer',
          });
          if (updated) touched.push(updated);
        }
      }

      // The other direction: a claim we flagged as vague, now answered with a
      // real number on the same topic. A ledger that only ever accuses is not
      // a ledger — the candidate has to be able to clear a flag.
      if (status === 'open' && found.quantified) {
        const vague = model
          .getModel()
          .claims.find(c => c.status === 'vague' && conceptOf(c.text) === found.concept);
        if (vague) {
          const cleared = corroborate(vague.id, 'quantified in a later answer');
          if (cleared) touched.push(cleared);
        }
      }
    }

    touched.push(model.addClaim({ text: sentence, status, note, conflictsWith }));
  }

  return touched;
}

/**
 * Mark a claim as verified — call this when a panelist probes a claim and the
 * candidate holds up. Phase 4 wires this to the panel's own judgement.
 */
function corroborate(claimId: string, note = 'held up under follow-up'): Claim | null {
  return model.updateClaim(claimId, { status: 'verified', note });
}

export const flaggedCount = (): number =>
  model.getModel().claims.filter(c => c.status === 'vague' || c.status === 'contradicted').length;
