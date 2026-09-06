import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Supabase Auth, used for one thing: turning the bearer token a recruiter's
// browser sends into a verified user id.
//
// The browser holds the session (supabase-js manages refresh) and attaches the
// access token to our own API calls. So there are no auth cookies to plumb
// through express, and no second place a session could go stale.

let client: SupabaseClient | null = null;

export function auth(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;

  client ??= createClient(url, key, {
    // A server has no browser storage and no user to keep signed in. Left on,
    // every request would try to persist and refresh a session that belongs to
    // whoever called last.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

/**
 * The verified user id inside a bearer token, or null.
 *
 * getClaims() is the check, not getUser() or getSession() — it verifies the
 * signature rather than trusting the token's contents. On a project using
 * asymmetric signing keys that verification is local against the JWKS; on a
 * legacy HS256 project it falls back to a call to Supabase Auth, which is a
 * round trip per request. Migrating the project to signing keys removes it.
 */
export async function userIdFrom(header: string | undefined): Promise<string | null> {
  const token = (header ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const supabase = auth();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) return null;
    return String(data.claims.sub);
  } catch {
    // A malformed token is a 401, not a 500 — it arrived from the internet.
    return null;
  }
}
