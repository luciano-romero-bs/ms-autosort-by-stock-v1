-- productTypes discovered by the daily cron that the user hasn't reviewed
-- yet. They render with a "Nueva" badge in the saved-automations panel and
-- their products sort to the very bottom of the collection until the user
-- dismisses the flag (which moves the type into product_type_order).
alter table collection_configs
  add column if not exists new_product_types jsonb not null default '[]'::jsonb;
