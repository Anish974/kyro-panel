// One thin call to an OpenAI-compatible chat API. Gemini and OpenAI both
// speak this, so switching providers is three lines in .env and none here.

const BASE = (process.env.LLM_BASE_URL ?? '').replace(/\/$/, '');
const MODEL = process.env.LLM_MODEL ?? '';
const KEY = process.env.LLM_API_KEY ?? '';

/** False when no key is configured — the panel then falls back to keywords. */
export const LLM_ENABLED = Boolean(BASE && MODEL && KEY);

// A panelist who takes too long is worse than a panelist who is predictable:
// the candidate is sitting in silence waiting for a voice.
const TIMEOUT_MS = 4000;

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
