// Which interview this browser tab is in.
//
// The server hands out a session id at sign-in and every later request has to
// carry it back: the event stream, the RTC token, starting and stopping the
// panel, and the scorecard at the end. Without it a request lands on nobody's
// interview and is refused.
//
// It is a capability, not an identifier — holding it is what authorises
// watching this interview and starting its agent — so it is kept in
// sessionStorage rather than localStorage. That scopes it to this tab and
// clears it when the tab closes, instead of leaving a live interview's key on
// a shared machine for the next person who opens the browser.

const KEY = 'kyro.session';

export interface Interview {
  sessionId: string;
  /** The RTC channel this interview happens in. Named by the server, never here. */
  channel: string;
}

let current: Interview | null = null;

/** A reload should rejoin the same interview, not strand the running agent. */
function restore(): Interview | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Interview>;
    return parsed.sessionId && parsed.channel
      ? { sessionId: parsed.sessionId, channel: parsed.channel }
      : null;
  } catch {
    // Private mode, or something else wrote here. Signing in again fixes it.
    return null;
  }
}

export function interview(): Interview | null {
  if (!current) current = restore();
  return current;
}

function remember(next: Interview): void {
  current = next;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not being able to persist it only costs a reload, so it is not an error.
  }
}

/**
 * Adds the session id to a server path.
 *
 * A query parameter rather than a header because EventSource cannot send
 * headers, and one mechanism for every call is worth more than the tidier one
 * that only works for some of them.
 */
export function scoped(path: string): string {
  const id = interview()?.sessionId;
  if (!id) return path;
  return `${path}${path.includes('?') ? '&' : '?'}session=${encodeURIComponent(id)}`;
}

/**
 * Signs in, which is what starts an interview server-side.
 *
 * Returns the interview and remembers it. Posting with an id already in hand
 * re-enters that same interview, which is what a reload does.
 */
export async function signIn(body: {
  name: string;
  role: string;
  level?: string;
  email?: string;
  resumeText?: string;
}): Promise<Interview> {
  const res = await fetch(scoped('/candidate'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const failure = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(failure?.error ?? `Could not start the interview (${res.status}).`);
  }

  const data = (await res.json()) as Partial<Interview>;
  if (!data.sessionId || !data.channel) {
    throw new Error('The server did not return a session — it may be running an older build.');
  }

  const next = { sessionId: data.sessionId, channel: data.channel };
  remember(next);
  return next;
}
