import pg from 'pg';

// One pool for the process. Postgres connections cost 1-3MB each, and Supabase
// caps them well below what a request-per-connection app would open, so every
// query in this server goes through here.
//
// DATABASE_URL absent is a supported mode, not a misconfiguration: the
// self-checks run with no network and no keys, and a fresh checkout should
// start and work before anyone has a database. Callers fall back to memory.

let pool: pg.Pool | null = null;
let announced = false;

export function db(): pg.Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;

  if (!pool) {
    pool = new pg.Pool({
      connectionString: url,
      // Supabase terminates TLS with a certificate this client has no root for.
      // The connection is still encrypted; we are declining to verify the chain,
      // which is what every Supabase connection string does by default.
      ssl: { rejectUnauthorized: false },
      // The pooler is already the thing multiplexing connections. A large pool
      // here just holds its slots open.
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    // An idle client erroring out — a pooler restart, a network blip — emits on
    // the pool. Unhandled, it takes the process down with it.
    pool.on('error', err => console.warn('[db] idle client error:', err.message));
  }

  if (!announced) {
    announced = true;
    console.log('[db] Postgres configured — interviews and scorecards persist');
  }
  return pool;
}

/**
 * Run a query, or return null when there is no database configured.
 *
 * Returning null rather than throwing is what lets every caller read as
 * "database if there is one, memory otherwise" without a second code path.
 */
export async function query<T extends pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[] | null> {
  const client = db();
  if (!client) return null;
  const result = await client.query<T>(text, values);
  return result.rows;
}

export async function close(): Promise<void> {
  await pool?.end();
  pool = null;
}
