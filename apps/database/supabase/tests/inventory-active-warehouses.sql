begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

create function public.iaw_id(n integer) returns uuid
language sql immutable as $$
  select ('00009100-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
insert into auth.users(id) values(iaw_id(9000));
insert into public.users(id) values(iaw_id(9000)) on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id) values
  (iaw_id(9010), 'Synthetic large alias workspace', false, iaw_id(9000)),
  (iaw_id(9011), 'Synthetic other workspace', false, iaw_id(9000));
insert into private.inventory_warehouses(id, ws_id, name)
select iaw_id(n), iaw_id(9010), 'Warehouse ' || lpad(n::text, 4, '0')
from generate_series(1, 1505) n;
insert into private.inventory_warehouses(id, ws_id, name)
values(iaw_id(1600), iaw_id(9011), 'Other workspace warehouse');
insert into private.inventory_identity_merges
  (ws_id, kind, source_id, target_id, preview, metadata_policy, stock_policy)
select iaw_id(9010), 'warehouse', iaw_id(n), iaw_id(1502), '{}', 'target', 'target'
from generate_series(1, 1501) n;
-- The same UUID in another kind or workspace must not hide this warehouse.
insert into private.inventory_identity_merges
  (ws_id, kind, source_id, target_id, preview, metadata_policy, stock_policy)
values
  (iaw_id(9010), 'product', iaw_id(1503), iaw_id(1502), '{}', 'target', 'target'),
  (iaw_id(9011), 'warehouse', iaw_id(1504), iaw_id(1600), '{}', 'target', 'target');

select is((select count(*) from private.inventory_identity_merges
  where ws_id = iaw_id(9010) and kind = 'warehouse'), 1501::bigint,
  'Fixture exceeds the PostgREST default 1000 row cap');
select is((select count(*) from private.inventory_active_warehouses
  where ws_id = iaw_id(9010)), 4::bigint,
  'Count excludes every alias before pagination');
select is((select count(*) from private.inventory_active_warehouses
  where id = iaw_id(1501)), 0::bigint,
  'Alias beyond the first 1000 is excluded');
select results_eq($$select id from private.inventory_active_warehouses
  where ws_id = public.iaw_id(9010) order by name limit 2 offset 0$$,
  $$values(public.iaw_id(1502)), (public.iaw_id(1503))$$,
  'First page contains active rows rather than aliases');
select results_eq($$select id from private.inventory_active_warehouses
  where ws_id = public.iaw_id(9010) order by name limit 2 offset 2$$,
  $$values(public.iaw_id(1504)), (public.iaw_id(1505))$$,
  'Second page retains workspace and kind isolation');
select is((select count(*) from private.inventory_active_warehouses
  where ws_id = iaw_id(9011)), 1::bigint, 'Other workspace retains its warehouse');
select is((select count(*) from private.inventory_active_warehouses
  where ws_id = iaw_id(9010) and name ilike '%1505%'), 1::bigint,
  'Search filters active rows before count');
select is((select count(*) from private.inventory_warehouses
  where ws_id = iaw_id(9010)), 1505::bigint, 'Historical source rows remain durable');
select ok(has_table_privilege('service_role', 'private.inventory_active_warehouses', 'SELECT'),
  'Service role can read the view');
select ok(not has_table_privilege('authenticated', 'private.inventory_active_warehouses', 'SELECT'),
  'Authenticated callers cannot bypass API permissions');
select ok(not has_table_privilege('anon', 'private.inventory_active_warehouses', 'SELECT'),
  'Anonymous callers cannot read warehouses');
select ok(not has_table_privilege('service_role', 'private.inventory_active_warehouses', 'INSERT,UPDATE,DELETE'),
  'View cannot mutate historical warehouse rows');
select * from finish();
rollback;
