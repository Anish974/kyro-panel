// Parsing only — no Agora SDK import, so this runs under plain node and the
// self-check can exercise it without a browser.
//
// Shapes are taken verbatim from Agora's own conversational-ai-api types, not
// inferred from traffic:
// https://github.com/AgoraIO-Community/Conversational-AI-Demo
//   Web/Scenes/VoiceAgent/src/conversational-ai-api/type.ts

/** EAgentState. `idle` is the resting state; `silent` is a deliberate non-answer. */
export type AgentState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'silent';

/** ETurnStatus: 0 in progress, 1 ended, 2 interrupted. */
const TURN_IN_PROGRESS = 0;

export interface LiveTranscript {
  speaker: 'candidate' | 'panel';
  text: string;
  /** False while the sentence is still being spoken or recognised. */
  final: boolean;
  turnId: number;
}

const AGENT_STATES: readonly AgentState[] = ['idle', 'listening', 'thinking', 'speaking', 'silent'];

export const isAgentState = (v: unknown): v is AgentState =>
  typeof v === 'string' && (AGENT_STATES as readonly string[]).includes(v);

/**
 * One transcript message off the wire, or null for anything the room does not
 * render — metrics, errors, interrupts, turn.finished, and empty text.
 *
 * `words` carries per-word timings for karaoke-style rendering. We render whole
 * lines instead: word-by-word needs RTC audio timestamps to stay in sync, which
 * is a lot of machinery for a two-line caption bar.
 *
 * ponytail: whole-line rendering. Switch to `words` + RTC audio-pts only if the
 * captions visibly lag the voice.
 */
export function toTranscript(msg: Record<string, unknown>): LiveTranscript | null {
  const text = typeof msg.text === 'string' ? msg.text : '';
  if (!text) return null;

  const turnId = Number(msg.turn_id) || 0;

  if (msg.object === 'user.transcription') {
    return { speaker: 'candidate', text, final: msg.final === true, turnId };
  }

  if (msg.object === 'assistant.transcription') {
    // An interrupted turn is finished as far as the caption is concerned — the
    // panelist stopped talking, so the line must stop growing. Only status 0
    // means more words are still coming.
    return {
      speaker: 'panel',
      text,
      final: Number(msg.turn_status) !== TURN_IN_PROGRESS,
      turnId,
    };
  }

  return null;
}
