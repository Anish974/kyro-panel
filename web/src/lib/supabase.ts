import { createClient, type Session } from '@supabase/supabase-js';

// Recruiter sign-in. Candidates never touch any of this — they arrive on an
// invite link, and a mock needs no account at all.
//
// The browser owns the session and supabase-js refreshes it. Our own API calls
// carry the access token as a bearer, so there is no auth cookie to keep in
// step between two servers.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null when the deployment has no Supabase project configured. */
export const supabase = url && key ? createClient(url, key) : null;

export const authConfigured = supabase !== null;

export async function currentSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(fn: (session: Session | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => fn(session));
  return () => data.subscription.unsubscribe();
}

export async function sendMagicLink(email: string): Promise<void> {
  if (!supabase) throw new Error('Sign-in is not configured on this deployment.');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Back to the portal, not to a callback route this app does not have.
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

/**
 * fetch, with the recruiter's token attached.
 *
 * Read the session per call rather than caching it: supabase-js rotates the
 * access token on refresh, and a captured one starts 401-ing an hour in with
 * no visible cause.
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const session = await currentSession();
  const headers = new Headers(init.headers);
  if (session) headers.set('authorization', `Bearer ${session.access_token}`);
  return fetch(input, { ...init, headers });
}
