-- Per-productType manual product ordering, toggleable independently of the
-- stock-based sort (R12). Shape: { [productType]: { enabled: boolean, order: string[] } }.
-- `order` holds product ids; products not listed fall back to stock desc,
-- appended after the positioned ones (see shared/sortCollection.mjs).
-- Toggling a category off keeps its saved `order` so re-enabling it later
-- doesn't require redoing the drag.
alter table collection_configs
  add column if not exists manual_product_order jsonb not null default '{}'::jsonb;
