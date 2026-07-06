create extension if not exists "pgcrypto";

create table if not exists collection_configs (
  id uuid primary key default gen_random_uuid(),
  collection_gid text not null unique,
  collection_title text,
  product_type_order jsonb not null default '[]'::jsonb,
  stock_threshold int not null default 0,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists run_logs (
  id uuid primary key default gen_random_uuid(),
  collection_gid text not null,
  status text not null check (status in ('success', 'error', 'skipped')),
  products_count int,
  message text,
  ran_at timestamptz not null default now()
);

create index if not exists run_logs_collection_gid_idx on run_logs (collection_gid);
create index if not exists run_logs_ran_at_idx on run_logs (ran_at desc);

-- Serialization lock for reorders. Needed only in this Vercel/serverless
-- variant: functions don't share memory across invocations, so the lock
-- can't live in a process-local Set like in the Argo CD/K8s version.
create table if not exists collection_locks (
  collection_gid text primary key,
  locked_at timestamptz not null default now()
);

-- Only the backend touches these tables, using the service_role key (which
-- bypasses RLS regardless). RLS is enabled anyway with no policies, so the
-- anon/authenticated keys are denied by default if they're ever used.
alter table collection_configs enable row level security;
alter table run_logs enable row level security;
alter table collection_locks enable row level security;
