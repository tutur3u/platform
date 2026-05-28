create table if not exists "public"."inventory_manufacturers" (
  "id" uuid primary key default gen_random_uuid(),
  "ws_id" uuid not null references public.workspaces(id) on delete cascade,
  "name" text not null,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_manufacturers_ws_id_name_key'
  ) then
    alter table "public"."inventory_manufacturers"
    add constraint "inventory_manufacturers_ws_id_name_key"
    unique ("ws_id", "name");
  end if;
end $$;

create index if not exists "inventory_manufacturers_ws_id_created_at_idx"
on "public"."inventory_manufacturers" using btree ("ws_id", "created_at" desc);

alter table "public"."workspace_products"
add column if not exists "manufacturer_id" uuid;

insert into "public"."inventory_manufacturers" ("ws_id", "name")
select distinct wp.ws_id, btrim(wp.manufacturer)
from public.workspace_products wp
where wp.manufacturer is not null
  and btrim(wp.manufacturer) <> ''
on conflict ("ws_id", "name") do nothing;

update "public"."workspace_products" wp
set "manufacturer_id" = im.id
from public.inventory_manufacturers im
where im.ws_id = wp.ws_id
  and im.name = btrim(wp.manufacturer)
  and wp.manufacturer_id is null
  and wp.manufacturer is not null
  and btrim(wp.manufacturer) <> '';

alter table "public"."workspace_products"
drop constraint if exists "workspace_products_manufacturer_id_fkey";

alter table "public"."workspace_products"
add constraint "workspace_products_manufacturer_id_fkey"
foreign key ("manufacturer_id") references public.inventory_manufacturers(id) on delete restrict;

create index if not exists "workspace_products_manufacturer_id_idx"
on "public"."workspace_products" using btree ("manufacturer_id");

create or replace function public.get_inventory_products(
  _category_ids uuid[] default null::uuid[],
  _ws_id uuid default null::uuid,
  _warehouse_ids uuid[] default null::uuid[],
  _has_unit boolean default null::boolean
)
returns table(
  id uuid,
  name text,
  manufacturer text,
  unit text,
  unit_id uuid,
  category text,
  price bigint,
  amount bigint,
  ws_id uuid,
  created_at timestamp with time zone
)
language plpgsql
as $function$
begin
  return query
  select
    p.id,
    p.name,
    im.name as manufacturer,
    iu.name as unit,
    ip.unit_id,
    pc.name as category,
    ip.price,
    coalesce(ip.amount, 0) as amount,
    p.ws_id,
    p.created_at
  from public.workspace_products p
    left join public.inventory_products ip
      on ip.product_id = p.id
      and (
        ip.warehouse_id = any(_warehouse_ids)
        and (
          ip.unit_id is not null
          or _has_unit is false
        )
      )
    left join public.inventory_units iu on ip.unit_id = iu.id
    left join public.product_categories pc on p.category_id = pc.id
    left join public.inventory_manufacturers im on p.manufacturer_id = im.id
  where (
      _category_ids is null
      or p.category_id = any(_category_ids)
    )
    and (
      _ws_id is null
      or p.ws_id = _ws_id
    )
    and (
      _has_unit is null
      or ip.unit_id is not null
    )
  order by p.name asc;
end;
$function$;

alter table "public"."workspace_products"
drop column if exists "manufacturer";

alter table "public"."inventory_manufacturers" enable row level security;

drop policy if exists "Allow members to view inventory manufacturers" on "public"."inventory_manufacturers";
create policy "Allow members to view inventory manufacturers"
on "public"."inventory_manufacturers"
as permissive
for select
to authenticated
using (
  public.has_workspace_permission(ws_id, auth.uid(), 'view_inventory_catalog')
  or public.has_workspace_permission(ws_id, auth.uid(), 'view_inventory_dashboard')
  or public.has_workspace_permission(ws_id, auth.uid(), 'manage_inventory_catalog')
  or public.has_workspace_permission(ws_id, auth.uid(), 'manage_inventory_setup')
  or public.has_workspace_permission(ws_id, auth.uid(), 'view_inventory')
);

drop policy if exists "Allow members to create inventory manufacturers" on "public"."inventory_manufacturers";
create policy "Allow members to create inventory manufacturers"
on "public"."inventory_manufacturers"
as permissive
for insert
to authenticated
with check (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_inventory_setup')
  or public.has_workspace_permission(ws_id, auth.uid(), 'create_inventory')
  or public.has_workspace_permission(ws_id, auth.uid(), 'update_inventory')
);

drop policy if exists "Allow members to update inventory manufacturers" on "public"."inventory_manufacturers";
create policy "Allow members to update inventory manufacturers"
on "public"."inventory_manufacturers"
as permissive
for update
to authenticated
using (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_inventory_setup')
  or public.has_workspace_permission(ws_id, auth.uid(), 'update_inventory')
)
with check (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_inventory_setup')
  or public.has_workspace_permission(ws_id, auth.uid(), 'update_inventory')
);

drop policy if exists "Allow members to delete inventory manufacturers" on "public"."inventory_manufacturers";
create policy "Allow members to delete inventory manufacturers"
on "public"."inventory_manufacturers"
as permissive
for delete
to authenticated
using (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_inventory_setup')
  or public.has_workspace_permission(ws_id, auth.uid(), 'delete_inventory')
);

select audit.enable_tracking('public.inventory_manufacturers'::regclass);
