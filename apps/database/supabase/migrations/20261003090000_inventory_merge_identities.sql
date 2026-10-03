-- Durable source identities preserve historical invoice/checkout/stock references.
-- Merges never delete products, warehouses, provider objects or historic records.
create table private.inventory_identity_merges (
 ws_id uuid not null references public.workspaces(id) on delete cascade,
 kind text not null check(kind in ('product','warehouse')),
 source_id uuid not null,
 target_id uuid not null,
 actor_id uuid references auth.users(id) on delete set null,
 preview jsonb not null,
 metadata_policy text not null check(metadata_policy in ('source','target')),
 stock_policy text not null check(stock_policy in ('source','target')),
 created_at timestamptz not null default now(),
 primary key(kind,source_id),
 check(source_id<>target_id)
);
alter table private.inventory_identity_merges enable row level security;
revoke all on private.inventory_identity_merges from public,anon,authenticated;
grant all on private.inventory_identity_merges to service_role;

-- Reject stale web, provider, mobile and offline writes before they can recreate
-- source stock or listings. Historical updates that retain their identity remain valid.
create function private.reject_merged_inventory_reference() returns trigger
language plpgsql security definer set search_path=pg_catalog,private,public as $$
declare v_kind text; v_id uuid; v_old jsonb;
begin
 if tg_op='UPDATE' then v_old:=to_jsonb(old); end if;
 for v_kind in select unnest(array['product','warehouse']) loop
  v_id:=nullif(to_jsonb(new)->>(v_kind||'_id'),'')::uuid;
  if v_id is not null and (tg_op='INSERT' or (v_old->>(v_kind||'_id')) is distinct from v_id::text)
   and exists(select 1 from private.inventory_identity_merges where kind=v_kind and source_id=v_id) then
   raise exception 'Inventory identity was merged; refresh and select its destination before retrying'
    using errcode='23514';
  end if;
 end loop;
 return new;
end; $$;

create function private.reject_merged_inventory_identity() returns trigger
language plpgsql security definer set search_path=pg_catalog,private,public as $$
begin
 if tg_op='DELETE' and not exists(select 1 from public.workspaces where id=old.ws_id) then return old; end if;
 if exists(select 1 from private.inventory_identity_merges where kind=tg_argv[0] and (source_id=old.id or (tg_op='DELETE' and target_id=old.id))) then
  raise exception 'Inventory identity was merged; use its destination' using errcode='23514';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;

create trigger inventory_product_merged_guard before update or delete on public.workspace_products
 for each row execute function private.reject_merged_inventory_identity('product');
create trigger inventory_warehouse_merged_guard before update or delete on private.inventory_warehouses
 for each row execute function private.reject_merged_inventory_identity('warehouse');

-- Include both schemas: private commerce tables also reference durable stock IDs.
do $$ declare r record; begin
 for r in select distinct c.conrelid::regclass as tbl from pg_constraint c
  where c.contype='f' and c.confrelid in ('public.workspace_products'::regclass,'private.inventory_warehouses'::regclass)
 loop
  execute format('create trigger inventory_merged_reference_guard before insert or update on %s for each row execute function private.reject_merged_inventory_reference()',r.tbl);
 end loop;
end $$;

-- Hide warehouse aliases from all new choices without changing direct historical
-- reads or the durable warehouse row. Product aliases use existing archived state.
create or replace function private.get_inventory_product_form_options(p_ws_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,private,public as $$
 select jsonb_build_object(
 'categories',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from public.product_categories x where x.ws_id=p_ws_id),'[]'::jsonb),
 'manufacturers',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from private.inventory_manufacturers x where x.ws_id=p_ws_id),'[]'::jsonb),
 'owners',coalesce((select jsonb_agg(to_jsonb(x) order by x.archived,x.name) from private.inventory_owners x where x.ws_id=p_ws_id),'[]'::jsonb),
 'financeCategories',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from public.transaction_categories x where x.ws_id=p_ws_id),'[]'::jsonb),
 'warehouses',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from private.inventory_warehouses x where x.ws_id=p_ws_id
  and not exists(select 1 from private.inventory_identity_merges m where m.kind='warehouse' and m.source_id=x.id)),'[]'::jsonb),
 'units',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from private.inventory_units x where x.ws_id=p_ws_id),'[]'::jsonb));
$$;
