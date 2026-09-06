import type { RequestHandler } from 'express';
import { AMBIENT_ID, findSession, inSession } from '../panel/model.js';

// Binds each request to the interview it belongs to.
//
// Everything downstream — the routes, the panel, the ledger, the scorecard —
// reads the current interview from async context rather than from a module
// global, so this middleware is the only place a request and a candidate are
// tied together. Get it right here and no handler can operate on the wrong
// person's interview by forgetting to thread an argument.

/**
 * Where the session id may travel.
 *
 * A path prefix exists for exactly one caller: Agora. It is given a callback URL
 * when the agent joins and posts chat completions to it from its own cloud, with
 * no way for us to add a query string or a header to what it sends. Naming the
 * session in the URL is the only channel we control.
 *
 * The browser uses the query string, which survives EventSource — it cannot set
 * headers at all — and sendBeacon, which carries no headers either. Those two
 * are the only ways in; a header would work for neither caller.
 */
function idFrom(req: { url: string; query: Record<string, unknown> }): string {
  const prefix = /^\/s\/([A-Za-z0-9_-]{1,64})(?=\/|$)/.exec(req.url);
  if (prefix) return prefix[1];
  const query = req.query.session;
  return typeof query === 'string' ? query : '';
}

/**
 * Resolves the session and runs the rest of the request inside it.
 *
 * An id that names nothing is refused rather than quietly falling back. A
 * session expires, and a candidate whose interview has been swept needs to be
 * told that — silently scoring their answers into a stranger's transcript, or
 * into the shared ambient one, is the failure this whole change exists to stop.
 *
 * No id at all still runs: the CLI in `scripts/agent.ts` and the self-checks
 * drive the ambient session in-process, and they never send one.
 */
export const withSession: RequestHandler = (req, res, next) => {
  const id = idFrom(req);
  if (!id) return next();

  // "ambient" is the one session id that is not a secret, so it is the one id
  // that may not be asked for over HTTP. It is reachable in-process by the CLI
  // and the self-checks, and by nobody who can type a URL.
  const found = id === AMBIENT_ID ? null : findSession(id);
  if (!found) {
    return res.status(404).json({ error: 'that interview has ended or expired — sign in again' });
  }

  // Strip the prefix so every route below is written as the plain path it was.
  // Agora's callback lands on /s/<id>/chat/completions and reaches the same
  // handler the browser's own requests do.
  req.url = req.url.replace(/^\/s\/[A-Za-z0-9_-]{1,64}(?=\/|$)/, '') || '/';

  inSession(found, next);
};
