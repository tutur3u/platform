-- Keep merge filtering inside PostgreSQL, before PostgREST count and pagination.
-- Historical reads and writes still use the durable inventory_warehouses table.
create view private.inventory_active_warehouses
with (security_invoker = true) as
select w.*
from private.inventory_warehouses w
where not exists (
  select 1
  from private.inventory_identity_merges m
  where m.ws_id = w.ws_id
    and m.kind = 'warehouse'
    and m.source_id = w.id
);

-- API callers authorize workspace permissions before service-role reads.
revoke all on private.inventory_active_warehouses from public, anon, authenticated, service_role;
grant select on private.inventory_active_warehouses to service_role;
