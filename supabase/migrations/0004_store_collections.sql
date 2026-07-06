-- Cached list of every collection of each store, synced on demand from
-- Shopify ("Refrescar colecciones" in the panel). Used to detect collections
-- that don't have an automation yet. `ignored` hides a collection from the
-- pending list without creating an automation.
create table if not exists store_collections (
  store_id uuid not null references stores(id) on delete cascade,
  collection_gid text not null,
  title text,
  sort_order text,
  products_count int,
  ignored boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (store_id, collection_gid)
);

alter table store_collections enable row level security;
