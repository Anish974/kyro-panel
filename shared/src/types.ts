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
  { id: 'technical', name: 'Arjun Mehta', role: 'Technical Architect', voice: 'English_Trustworth_Man',      color: '#6a8bff' },
  { id: 'product',   name: 'Ananya Shah', role: 'Product Manager',     voice: 'English_captivating_female1', color: '#c98bff' },
  { id: 'hr',        name: 'Rohan Iyer',  role: 'Behavioural / HR',    voice: 'English_Gentle-voiced_man',    color: '#46c9b0' },
] as const;

export const panelistById = (id: PanelistId): Panelist =>
  PANEL.find(p => p.id === id)!;

// ---------------------------------------------------------------- competency

/**
 * The five axes every verdict is written against.
 *
 * Aligned with how structured interviews are actually scored — Google's
 * role-related knowledge / cognitive ability / leadership signals, and the
 * communication + problem-solving + technical-competency dimensions common to
 * published FAANG rubrics. Coding-specific axes like "testing" and "code
 * quality" are deliberately absent: this is a spoken interview about work
 * already done, and nothing here can be graded from a transcript unless the
 * candidate can say it out loud.
 *
 * Five, not more. Ten questions split across three interviewers is already thin
 * evidence per axis; another axis buys a column and dilutes every one of them.
 */
export type CompetencyId =
  | 'technicalDepth'
  | 'problemSolving'
  | 'impact'
  | 'communication'
  | 'ownership';

export const COMPETENCIES: Record<CompetencyId, string> = {
  // Was 'System design', which only fit a backend candidate. The panel now
  // interviews for data, frontend, platform and anything typed into "Other",
  // and a data engineer was being marked against an axis nobody asked them about.
  technicalDepth: 'Technical depth',
  problemSolving: 'Problem solving & trade-offs',
  // Was 'Customer impact'. For an infrastructure or data role the honest
  // question is not who the customer was, it is which number moved and whether
  // they know it.
  impact: 'Impact & outcomes',
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

// ------------------------------------------------------------------ profile

export type ExperienceLevel =
  | 'Intern'
  | 'Beginner (0-2 years)'
  | 'Intermediate (2-6 years)'
  | 'Expert (6-11+ years)';

export const EXPERIENCE_LEVELS = [
  'Intern',
  'Beginner (0-2 years)',
  'Intermediate (2-6 years)',
  'Expert (6-11+ years)',
] as const;

/**
 * Who is in the room, captured on the login screen before the panel joins.
 * The panel reads this so it can open by name and probe the candidate's own
 * background instead of asking generic warm-ups.
 *
 * `resumeText` is candidate-supplied text that ends up inside an LLM prompt —
 * it is DATA, never instructions. bidding.ts fences it, and the server caps its
 * length on the way in.
 */
export interface CandidateProfile {
  name: string;
  role: string;
  level?: string;
  email?: string;
  /** Plain text extracted from the uploaded resume. Absent when none was given. */
  resumeText?: string;
}

/** Hard caps applied server-side. Shared so the form can refuse before posting. */
/**
 * One scheduled interview. Created by the company, opened by the candidate
 * through /?i=<code> — which is why role and level live here and not on the
 * login form: the company sets the bar, the candidate turns up to it.
 */
export interface Interview {
  /** Short code the invite link is built on. Crockford base32, 6 chars. */
  code: string;
  candidateName: string;
  role: string;
  /** One of EXPERIENCE_LEVELS. Drives panel difficulty. */
  level: string;
  createdAt: number;
  /** When the candidate first opened the room, or null if they have not. */
  startedAt: number | null;
  /**
   * Practice, not an assessment. A candidate schedules these for themselves —
   * and so picks their own level, which is only acceptable because nobody is
   * hiring off the result. Kept out of the company portal.
   */
  mock: boolean;
}

export const PROFILE_LIMITS = {
  name: 80,
  role: 80,
  level: 80,
  email: 160,
  resumeText: 20_000,
} as const;

// ----------------------------------------------------------------- the model

/** Every panelist reads and writes this. Nobody keeps a private memory. */
export interface CandidateModel {
  sessionId: string;
  /** Set at login. Null until the candidate has entered who they are. */
  profile: CandidateProfile | null;
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
  level?: string;
  candidateName: string;
  durationSec: number;
  verdicts: PanelistVerdict[];
  claims: Claim[];
  /** True when the panel did not agree — surfaced prominently, not smoothed over. */
  dissent: boolean;
  timestamp?: number;
  turns?: number;
  /** From a mock interview the candidate ran on themselves. Not hiring data. */
  mock?: boolean;
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
  | { type: 'scorecard'; scorecard: Scorecard }
  /**
   * The panel has just spoken its closing line and the interview is over.
   *
   * `speakMs` is roughly how long that line takes to say — the room waits it
   * out before ending, so the candidate hears the goodbye instead of the call
   * dropping mid-sentence.
   */
  | { type: 'concluded'; reason: string; speakMs: number };

// ------------------------------------------------------------------ helpers

export function emptyModel(sessionId: string, profile: CandidateProfile | null = null): CandidateModel {
  return {
    sessionId,
    profile,
    skills: {
      technicalDepth: 0.5,
      problemSolving: 0.5,
      impact: 0.5,
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
