-- Adds multi-store support: each store's Shopify domain + admin token is
-- now a row in `stores` (managed from the panel), not a global env var.
-- Written as a clean rebuild of the store-scoped tables since this project
-- has no production data yet — everything from here on is keyed by store.

create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  shop_domain text not null unique,
  admin_token text not null,
  api_version text not null default '2025-10',
  created_at timestamptz not null default now()
);

alter table stores enable row level security;

drop table if exists collection_locks;
drop table if exists run_logs;
drop table if exists collection_configs;

create table collection_configs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  collection_gid text not null,
  collection_title text,
  product_type_order jsonb not null default '[]'::jsonb,
  stock_threshold int not null default 0,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (store_id, collection_gid)
);

create table run_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  collection_gid text not null,
  status text not null check (status in ('success', 'error', 'skipped')),
  products_count int,
  message text,
  ran_at timestamptz not null default now()
);

create index run_logs_store_collection_idx on run_logs (store_id, collection_gid);
create index run_logs_ran_at_idx on run_logs (ran_at desc);

-- Serialization lock for reorders, scoped per store + collection (R5.5).
create table collection_locks (
  store_id uuid not null references stores(id) on delete cascade,
  collection_gid text not null,
  locked_at timestamptz not null default now(),
  primary key (store_id, collection_gid)
);

-- Only the backend touches these tables, using the service_role key (which
-- bypasses RLS regardless). RLS is enabled anyway with no policies, so the
-- anon/authenticated keys are denied by default if they're ever used.
alter table collection_configs enable row level security;
alter table run_logs enable row level security;
alter table collection_locks enable row level security;
