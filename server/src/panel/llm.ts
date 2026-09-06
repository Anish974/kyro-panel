// One thin call to an OpenAI-compatible chat API. Gemini and OpenAI both
// speak this, so switching providers is three lines in .env and none here.

const BASE = (process.env.LLM_BASE_URL ?? '').replace(/\/$/, '');
const MODEL = process.env.LLM_MODEL ?? '';
const KEY = process.env.LLM_API_KEY ?? '';

/** False when no key is configured — the panel then falls back to keywords. */
export const LLM_ENABLED = Boolean(BASE && MODEL && KEY);

// Allow enough budget for multi-panelist JSON generation so the panel never
// prematurely falls back to canned keyword templates.
const TIMEOUT_MS = 8000;

export async function ask(system: string, user: string, maxTokens = 220): Promise<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * A stream can be cut off mid-sentence, which is worse than a slow one — the
 * candidate hears half a question. So it gets longer than `TIMEOUT_MS`, which
 * guards a call whose whole answer is still worthless when it lands late.
 */
const STREAM_TIMEOUT_MS = 15_000;

/**
 * The same call, delivered a token at a time.
 *
 * This exists for one reason: the reply is spoken. Waiting for the whole thing
 * before handing it to TTS puts the entire generation time in front of the
 * first syllable, and the room sits silent for it. Forwarded as it arrives, the
 * panel starts talking as soon as it has a few words — the rest is written
 * while it is still speaking the beginning.
 *
 * `onDelta` gets each fragment. The full text is returned as well, so callers
 * that also need to store the reply do not have to reassemble it.
 */
export async function askStream(
  system: string,
  user: string,
  maxTokens: number,
  onDelta: (text: string) => void,
): Promise<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
      stream: true,
    }),
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  if (!res.body) throw new Error('LLM returned no body to stream');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    // Carriage returns are dropped so one frame separator works for providers
    // that send \r\n\r\n and for those that send \n\n.
    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');

    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);

      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const delta = (JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          }).choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            onDelta(delta);
          }
        } catch {
          // Keep-alives and vendor-specific frames are not our chunks. A frame
          // we cannot read is not a reason to drop the ones after it.
        }
      }
    }
  }

  return full;
}

/**
 * Models wrap JSON in prose or fences no matter how firmly you ask them not to.
 * Pull the first balanced object out rather than trusting the whole string.
 */
export function parseJson<T>(text: string): T | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1)) as T;
      } catch {
        return null;
      }
    }
  }
  return null;
}
