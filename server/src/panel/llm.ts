// One thin call to an OpenAI-compatible chat API. Gemini and OpenAI both
// speak this, so switching providers is three lines in .env and none here.

const BASE = (process.env.LLM_BASE_URL ?? '').replace(/\/$/, '');
const MODEL = process.env.LLM_MODEL ?? '';
const KEY = process.env.LLM_API_KEY ?? '';

/**
 * A second key, on a second account, for when the first one is out of quota.
 *
 * Free-tier quota is per account, so a spare key is the only retry that helps:
 * waiting and asking the same account again gets the same 429. This is not
 * belt-and-braces — a real interview lost a turn to it, and what the candidate
 * heard was one of the canned keyword lines while they sat waiting.
 *
 * Optional. Without it the panel behaves exactly as before.
 */
const SPARE_KEY = process.env.LLM_API_KEY_FALLBACK ?? '';

/** False when no key is configured — the panel then falls back to keywords. */
export const LLM_ENABLED = Boolean(BASE && MODEL && KEY);

/**
 * How long the panel will wait for the model before it speaks from keywords.
 *
 * This is a ceiling on dead air, not a budget to spend: three drafts are about
 * 210 output tokens, which flash-lite finishes in under two seconds, so a call
 * still running at nine has hit a throttle and is not coming back in time. The
 * candidate has then been sitting in silence for nine seconds and the honest
 * move is a canned question, immediately, rather than five more seconds of
 * nothing followed by the same canned question.
 */
const TIMEOUT_MS = 9000;

/** Out of quota, or the provider itself is having a moment. Worth a second key. */
const worthRetrying = (status: number): boolean => status === 429 || status >= 500;

export async function ask(system: string, user: string, maxTokens = 220): Promise<string> {
  const send = (key: string) =>
    fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
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

  const startedAt = Date.now();
  let res = await send(KEY);

  // Straight to the spare rather than waiting first: a 429 comes back
  // immediately and the other account has its own quota, so there is nothing to
  // wait out. A timeout is not retried at all — the candidate has already been
  // sitting in silence for the full budget, and a second one doubles it.
  if (worthRetrying(res.status) && SPARE_KEY) {
    console.warn(`[llm] ${res.status} on the primary key — trying the spare`);
    res = await send(SPARE_KEY);
  }

  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  // The one number that says whether the panel is slow because the model is
  // slow, or because of everything else in the turn. Printed every turn: a
  // throttled free tier shows up here as seconds, and nowhere else.
  const ms = Date.now() - startedAt;
  console.log(
    `[llm] ${ms}ms | in ${data.usage?.prompt_tokens ?? '?'} out ${data.usage?.completion_tokens ?? '?'} tokens` +
    (ms > 4000 ? '  <- slow, the candidate heard silence for this long' : ''),
  );

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
