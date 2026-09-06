// Run: npm run db:setup -w server
//
// Applies db/schema.sql. Every statement in it is `if not exists` or an idempotent
// alter, so running this against a live database is safe and repeatable — it is
// the migration story until there is a second version of the schema to migrate to.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { close, db } from '../db/pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readFileSync(path.resolve(here, '../db/schema.sql'), 'utf8');

const pool = db();
if (!pool) {
  console.error('DATABASE_URL is not set — nothing to set up.');
  console.error('Add it to .env (the password must be percent-encoded) and try again.');
  process.exit(1);
}

try {
  await pool.query(schema);

  const { rows } = await pool.query<{ table_name: string; rls: boolean; rows: string }>(
    `select c.relname as table_name,
            c.relrowsecurity as rls,
            (select count(*)::text from pg_policy p where p.polrelid = c.oid) as rows
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('interviews', 'scorecards')
      order by c.relname`,
  );

  for (const t of rows) {
    console.log(`  ${t.table_name.padEnd(12)} rls=${t.rls ? 'on' : 'OFF'}  policies=${t.rows}`);
  }
  if (rows.some(t => !t.rls)) {
    console.error('\nA table has RLS off. The anon key can read it through PostgREST. Fix before shipping.');
    process.exit(1);
  }

  console.log('\nschema applied — RLS on, no policies, so PostgREST serves nothing to the anon key');
} catch (err) {
  console.error('schema failed:', (err as Error).message);
  process.exit(1);
} finally {
  await close();
}
