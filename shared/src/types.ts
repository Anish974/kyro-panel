// The contract between the server (Anish) and the web app (Nidhi).
//
// This file is the single source of truth for the Shared Candidate Model.
// Change a field here and both sides fail to compile — which is the point.
// Do not redefine any of these shapes locally.

export type PanelistId = 'technical' | 'product' | 'hr';

export interface Panelist {
  id: PanelistId;
  name: string;
  role: string;
  /** TTS voice id — must match the vendor configured when the agent starts. */
  voice: string;
  /** Hex accent used for this panelist everywhere in the UI. */
  color: string;
}

/** The panel. Names come from the submitted deck — do not rename casually. */
export const PANEL: readonly Panelist[] = [
  { id: 'technical', name: 'Arjun Mehta', role: 'Technical Architect', voice: 'male_1',   color: '#6a8bff' },
  { id: 'product',   name: 'Ananya Shah', role: 'Product Manager',     voice: 'female_1', color: '#c98bff' },
  { id: 'hr',        name: 'Rohan Iyer',  role: 'Behavioural / HR',    voice: 'male_2',   color: '#46c9b0' },
] as const;

export const panelistById = (id: PanelistId): Panelist =>
  PANEL.find(p => p.id === id)!;

// ---------------------------------------------------------------- competency

export type CompetencyId =
  | 'systemDesign'
  | 'tradeoffReasoning'
  | 'customerImpact'
  | 'communication'
  | 'ownership';

export const COMPETENCIES: Record<CompetencyId, string> = {
  systemDesign: 'System design',
  tradeoffReasoning: 'Trade-off reasoning',
  customerImpact: 'Customer impact',
  communication: 'Communication',
  ownership: 'Ownership & scope',
};

// -------------------------------------------------------------------- claims

export type ClaimStatus = 'open' | 'verified' | 'vague' | 'contradicted';

export interface Claim {
  id: string;
  /** What the candidate actually said, verbatim. */
  text: string;
  /** Seconds into the session. */
  t: number;
  status: ClaimStatus;
  /** Set when status is 'contradicted' — the id of the claim it conflicts with. */
  conflictsWith?: string;
  /** Why it was flagged, in one line, shown in the UI. */
  note?: string;
}

// ---------------------------------------------------------------- transcript

export interface TranscriptTurn {
  /** 'candidate', or the panelist who held the floor. */
  speaker: 'candidate' | PanelistId;
  text: string;
  /** Seconds into the session. */
  t: number;
}

// ------------------------------------------------------------------ scenario

/**
 * A role-play the panel puts the candidate inside — "you are on call, checkout
 * is failing". Grounded in something the candidate already claimed, so it
 * cannot be rehearsed. One at a time: a panel that opens three at once is
 * interrogating, not interviewing.
 */
export interface Scenario {
  premise: string;
  openedBy: PanelistId;
  /** Seconds into the session. */
  t: number;
  /** Turns the candidate has spent inside it. */
  turns: number;
}

// ----------------------------------------------------------------- the model

/** Every panelist reads and writes this. Nobody keeps a private memory. */
export interface CandidateModel {
  sessionId: string;
  /** 0..1 per competency. */
  skills: Record<CompetencyId, number>;
  /** 1..5, moves with performance. */
  difficulty: number;
  claims: Claim[];
  /** Things the panel noticed were missing, in plain words. */
  gaps: string[];
  transcript: TranscriptTurn[];
  turns: number;
  lastSpeaker: PanelistId | null;
  /** The role-play currently running, if any. */
  scenario: Scenario | null;
  /** Seconds since the session started. */
  elapsed: number;
}

// -------------------------------------------------------------------- bidding

export interface Bid {
  panelist: PanelistId;
  /** 0..1 — how badly this panelist wants the floor. */
  score: number;
  /** One line, shown in the UI and kept for the scorecard. */
  reason: string;
  intent: 'probe' | 'challenge' | 'followup' | 'handoff';
}

export interface TurnDecision {
  bids: Bid[];
  winner: PanelistId;
  /** What the winner says. */
  reply: string;
  /** False when the panelist must not be cut off mid-sentence. */
  interruptable: boolean;
}

// ---------------------------------------------------------------- scorecard

export type Verdict = 'hire' | 'lean_hire' | 'lean_no_hire' | 'no_hire';

export interface PanelistVerdict {
  panelist: PanelistId;
  verdict: Verdict;
  /** 0..5. Never averaged across panelists — the disagreement is the product. */
  score: number;
  confidence: number;
  rationale: string;
  /** Every claim must point at something the candidate actually said. */
  evidence: { quote: string; t: number }[];
  ratings: Partial<Record<CompetencyId, number>>;
}

export interface Scorecard {
  sessionId: string;
  role: string;
  candidateName: string;
  durationSec: number;
  verdicts: PanelistVerdict[];
  claims: Claim[];
  /** True when the panel did not agree — surfaced prominently, not smoothed over. */
  dissent: boolean;
}

// -------------------------------------------- server -> browser (SSE /events)

/** Live updates pushed to the room UI. One-way; the browser never posts back. */
export type SessionEvent =
  | { type: 'state'; model: CandidateModel }
  | { type: 'bids'; bids: Bid[]; winner: PanelistId }
  | { type: 'speaking'; panelist: PanelistId | null; text?: string }
  | { type: 'caption'; speaker: 'candidate' | PanelistId; text: string; final: boolean }
  | { type: 'claim'; claim: Claim }
  | { type: 'scenario'; scenario: Scenario | null }
  | { type: 'scorecard'; scorecard: Scorecard };

// ------------------------------------------------------------------ helpers

export function emptyModel(sessionId: string): CandidateModel {
  return {
    sessionId,
    skills: {
      systemDesign: 0.5,
      tradeoffReasoning: 0.5,
      customerImpact: 0.5,
      communication: 0.5,
      ownership: 0.5,
    },
    difficulty: 2,
    claims: [],
    gaps: [],
    transcript: [],
    turns: 0,
    lastSpeaker: null,
    scenario: null,
    elapsed: 0,
  };
}
