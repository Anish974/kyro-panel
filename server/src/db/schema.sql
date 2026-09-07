-- Kyro Panel schema. Idempotent: safe to run against a fresh or existing
-- database, which is what `npm run db:setup -w server` does.
--
-- Two things outlive the process: the interviews a company scheduled, and the
-- scorecards finished interviews produced. The live interview itself stays in
-- memory on purpose — it is a conversation in flight, not a record.

-- ---------------------------------------------------------------- interviews
create table if not exists public.interviews (
  -- The invite code IS the identity here. It is what the candidate's link
  -- carries and what a recruiter reads back, so a separate surrogate key would
  -- be a second name for the same thing.
  code            text primary key,
  candidate_name  text        not null check (length(candidate_name) between 1 and 80),
  role            text        not null check (length(role) between 1 and 80),
  -- Checked in the application against EXPERIENCE_LEVELS; kept non-empty here
  -- so a bad write cannot land a blank bar that silently grades as default.
  level           text        not null check (length(level) between 1 and 80),
  -- Practice the candidate set up for themselves. Not hiring data.
  mock            boolean     not null default false,
  created_at      timestamptz not null default now(),
  started_at      timestamptz
);

-- How long the interview is booked for, in minutes. Added after the fact, so
-- every row written before it is null — and null means ten, because ten turns
-- over ten to twelve minutes is exactly what those interviews were. Checked
-- against the same closed set the application offers, so a bad write cannot
-- pace a panel off a number nobody chose.
alter table public.interviews
  add column if not exists duration_min integer
  check (duration_min is null or duration_min in (5, 10, 15));

-- Which recruiter scheduled it. A Supabase Auth user id, added after the fact,
-- so it is nullable: a mock interview has no owner because the candidate set it
-- up for themselves and no company should ever see it in a portal.
--
-- No foreign key to auth.users on purpose — that table belongs to Supabase, and
-- coupling our schema to it means a deleted account takes its interviews and
-- their scorecards with it. Orphaned rows are the better failure here.
alter table public.interviews add column if not exists owner_id uuid;

-- The portal lists newest first and nothing else, so this is the whole access
-- pattern. created_at alone would still need a sort within equal timestamps;
-- code breaks the tie the same way the application does.
create index if not exists interviews_recent_idx
  on public.interviews (created_at desc, code desc);

-- Every portal query starts "the interviews that are mine", so the owner has to
-- lead the index or it sorts the whole table and throws most of it away.
create index if not exists interviews_owner_idx
  on public.interviews (owner_id, created_at desc);

-- ---------------------------------------------------------------- scorecards
create table if not exists public.scorecards (
  session_id      text primary key,
  -- Null for the interviews that pre-date invite codes, and for any session
  -- that ended without one. on delete set null: deleting a scheduled interview
  -- must not take the assessment it produced with it.
  interview_code  text references public.interviews (code) on delete set null,
  candidate_name  text        not null,
  role            text        not null,
  level           text,
  duration_sec    integer     not null default 0 check (duration_sec >= 0),
  turns           integer     not null default 0 check (turns >= 0),
  -- The panel disagreed. Stored rather than derived: it is what the card leads
  -- with, and recomputing it from verdicts would let the two drift apart.
  dissent         boolean     not null default false,
  mock            boolean     not null default false,
  -- Three verdicts and the claims ledger. Read and written whole, never
  -- queried into, so jsonb columns beat two more tables and a join.
  verdicts        jsonb       not null default '[]'::jsonb,
  claims          jsonb       not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

-- Every foreign key wants an index on the referring side, or deleting one
-- interview sequentially scans this table to find what points at it.
create index if not exists scorecards_interview_idx
  on public.scorecards (interview_code);

-- The portal's only query: real assessments, newest first. Partial, because
-- mock interviews are excluded from it and there is no reason to index rows
-- that query will never return.
create index if not exists scorecards_hiring_recent_idx
  on public.scorecards (created_at desc)
  where mock = false;

-- -------------------------------------------------------------------- access
-- Supabase publishes every table in `public` through PostgREST, and the anon
-- key that reaches it is public by design — it ships in browser code. RLS on
-- with no policies is what makes that safe: anon and authenticated get nothing
-- at all through the API.
--
-- This server does not go through PostgREST. It connects as the postgres role
-- over the pooler, and that role bypasses RLS — so these two lines cost the
-- application nothing and close the REST door completely.
alter table public.interviews enable row level security;
alter table public.scorecards enable row level security;

-- What was actually said. The verdicts quote a line or two each and the ledger
-- keeps the checkable sentences, but neither is the conversation — and a hiring
-- decision nobody can read back is not a reviewable one. jsonb because it is
-- read whole, by one screen, and never queried into.
alter table public.scorecards add column if not exists transcript jsonb;
