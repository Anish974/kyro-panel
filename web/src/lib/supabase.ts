import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';

// Recruiter sign-in. Candidates never touch any of this — they arrive on an
// invite link, and a mock needs no account at all.
//
// The browser owns the session and supabase-js refreshes it. Our own API calls
// carry the access token as a bearer, so there is no auth cookie to keep in
// step between two servers.

const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

let clientInstance: SupabaseClient | null = envUrl && envKey ? createClient(envUrl, envKey) : null;
let initPromise: Promise<SupabaseClient | null> | null = null;
const authListeners: Array<(session: Session | null) => void> = [];

export async function getSupabase(): Promise<SupabaseClient | null> {
  if (clientInstance) return clientInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const res = await fetch('/config');
      if (res.ok) {
        const data = await res.json();
        const runtimeUrl = (data.supabaseUrl as string | undefined)?.trim() || envUrl;
        const runtimeKey = (data.supabaseAnonKey as string | undefined)?.trim() || envKey;
        if (runtimeUrl && runtimeKey) {
          clientInstance = createClient(runtimeUrl, runtimeKey);
          authConfigured = true;
          clientInstance.auth.onAuthStateChange((_event, session) => {
            authListeners.forEach(fn => fn(session));
          });
          return clientInstance;
        }
      }
    } catch (err) {
      console.warn('Could not load runtime Supabase config:', err);
    }
    return null;
  })();

  return initPromise;
}

export async function checkAuthConfigured(): Promise<boolean> {
  const client = await getSupabase();
  return client !== null;
}

export let authConfigured = clientInstance !== null;

export async function currentSession(): Promise<Session | null> {
  const client = await getSupabase();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session;
}

export function onAuthChange(fn: (session: Session | null) => void): () => void {
  authListeners.push(fn);
  if (clientInstance) {
    const { data } = clientInstance.auth.onAuthStateChange((_event, session) => fn(session));
    return () => {
      const idx = authListeners.indexOf(fn);
      if (idx >= 0) authListeners.splice(idx, 1);
      data.subscription.unsubscribe();
    };
  } else {
    void getSupabase().then(client => {
      if (client) {
        client.auth.getSession().then(({ data }) => fn(data.session));
      }
    });
    return () => {
      const idx = authListeners.indexOf(fn);
      if (idx >= 0) authListeners.splice(idx, 1);
    };
  }
}

export async function sendMagicLink(email: string): Promise<void> {
  const client = await getSupabase();
  if (!client) throw new Error('Sign-in is not configured on this deployment.');
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const client = await getSupabase();
  await client?.auth.signOut();
}

/**
 * fetch, with the recruiter's token attached.
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const session = await currentSession();
  const headers = new Headers(init.headers);
  if (session) headers.set('authorization', `Bearer ${session.access_token}`);
  return fetch(input, { ...init, headers });
}
