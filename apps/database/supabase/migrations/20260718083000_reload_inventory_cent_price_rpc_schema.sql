-- The cent-level price migration created this service-only capability probe,
-- but Production PostgREST can retain a stale schema cache after an RPC is
-- added. Re-declare its contract and explicitly reload the API schema so the
-- Square importer can verify decimal storage before releasing legacy holds.
create or replace function public.inventory_cent_level_prices_ready()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from pg_attribute
    where attrelid = 'private.inventory_products'::regclass
      and attname = 'price'
      and atttypid = 'numeric'::regtype
      and not attisdropped
  );
$$;

revoke all on function public.inventory_cent_level_prices_ready() from public;
grant execute on function public.inventory_cent_level_prices_ready()
  to service_role;

notify pgrst, 'reload schema';
