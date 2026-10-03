-- A response and every create side effect commit in one transaction.
-- Service-role callers must first authorize the captured actor and resource kind.
create table private.inventory_offline_create_receipts (
  actor_id uuid not null references public.users(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  operation_id uuid not null,
  resource text not null,
  request_payload jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, ws_id, operation_id)
);
alter table private.inventory_offline_create_receipts enable row level security;
revoke all on private.inventory_offline_create_receipts
  from public, anon, authenticated, service_role;

create function private.apply_inventory_offline_create(
  p_actor_id uuid, p_ws_id uuid, p_operation_id uuid,
  p_resource text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_previous private.inventory_offline_create_receipts;
  v_id uuid := pg_catalog.gen_random_uuid();
  v_data jsonb;
  v_response jsonb;
  v_item jsonb;
  v_product_id uuid;
  v_name text := nullif(btrim(p_payload->>'name'), '');
  v_workspace_user_id uuid;
  v_entity_kind text;
begin
  if p_actor_id is null or p_ws_id is null or p_operation_id is null
    or p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or p_resource is null or p_resource not in ('owner','manufacturer','category','unit','warehouse',
      'finance_category','product','period') then
    raise exception 'Invalid offline create request' using errcode = '22023';
  end if;
  -- This lock serializes retries, including same-ID attempts of another kind.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_actor_id::text || '|' || p_ws_id::text || '|' || p_operation_id::text, 0));
  perform 1 from public.workspace_members
    where user_id = p_actor_id and ws_id = p_ws_id for share;
  if not found then
    raise exception 'Workspace membership is required' using errcode = '42501';
  end if;
  select * into v_previous from private.inventory_offline_create_receipts
    where actor_id = p_actor_id and ws_id = p_ws_id
      and operation_id = p_operation_id for update;
  if found then
    if v_previous.resource <> p_resource or
      v_previous.request_payload is distinct from p_payload then
      raise exception 'Offline operation identity has a different request'
        using errcode = '23505';
    end if;
    return v_previous.response || jsonb_build_object('replayed', true);
  end if;
  if v_name is null then
    raise exception 'A name is required' using errcode = '22023';
  end if;
  select virtual_user_id into v_workspace_user_id
    from public.workspace_user_linked_users
    where platform_user_id = p_actor_id and ws_id = p_ws_id;

  case p_resource
    when 'owner' then
      if nullif(p_payload->>'linked_workspace_user_id','') is not null then
        perform 1 from public.workspace_users where ws_id = p_ws_id
          and id = (p_payload->>'linked_workspace_user_id')::uuid for share;
        if not found then
          raise exception 'Invalid linked workspace user' using errcode = '23503';
        end if;
      end if;
      insert into private.inventory_owners
        (id, ws_id, name, avatar_url, linked_workspace_user_id)
        values (v_id, p_ws_id, v_name, p_payload->>'avatar_url',
          nullif(p_payload->>'linked_workspace_user_id','')::uuid)
        returning to_jsonb(inventory_owners.*) into v_data;
      v_entity_kind := 'owner';
    when 'manufacturer' then
      insert into private.inventory_manufacturers (id, ws_id, name)
        values (v_id, p_ws_id, v_name)
        returning to_jsonb(inventory_manufacturers.*) into v_data;
      v_entity_kind := 'manufacturer';
    when 'category' then
      insert into public.product_categories (id, ws_id, name)
        values (v_id, p_ws_id, v_name)
        returning to_jsonb(product_categories.*) into v_data;
      v_entity_kind := 'category';
    when 'unit' then
      insert into private.inventory_units (id, ws_id, name)
        values (v_id, p_ws_id, v_name)
        returning to_jsonb(inventory_units.*) into v_data;
      v_entity_kind := 'unit';
    when 'warehouse' then
      insert into private.inventory_warehouses (id, ws_id, name)
        values (v_id, p_ws_id, v_name)
        returning to_jsonb(inventory_warehouses.*) into v_data;
      v_entity_kind := 'warehouse';
    when 'finance_category' then
      if jsonb_typeof(p_payload->'is_expense') is distinct from 'boolean' then
        raise exception 'Category type is required' using errcode = '22023';
      end if;
      insert into public.transaction_categories
        (id, ws_id, name, is_expense, description, icon, color)
        values (v_id, p_ws_id, v_name, (p_payload->>'is_expense')::boolean,
          p_payload->>'description', p_payload->>'icon', p_payload->>'color')
        returning to_jsonb(transaction_categories.*) into v_data;
    when 'product' then
      perform 1 from public.product_categories where ws_id = p_ws_id
        and id = (p_payload->>'category_id')::uuid for share;
      if not found then
        raise exception 'Invalid product category' using errcode = '23503';
      end if;
      perform 1 from private.inventory_owners where ws_id = p_ws_id
        and id = (p_payload->>'owner_id')::uuid for share;
      if not found then
        raise exception 'Invalid inventory owner' using errcode = '23503';
      end if;
      if nullif(p_payload->>'manufacturer_id','') is not null then
        perform 1 from private.inventory_manufacturers where ws_id = p_ws_id
          and id = (p_payload->>'manufacturer_id')::uuid for share;
        if not found then
          raise exception 'Invalid manufacturer' using errcode = '23503';
        end if;
      end if;
      if nullif(p_payload->>'finance_category_id','') is not null then
        perform 1 from public.transaction_categories where ws_id = p_ws_id
          and id = (p_payload->>'finance_category_id')::uuid for share;
        if not found then
          raise exception 'Invalid Finance category' using errcode = '23503';
        end if;
      end if;
      if jsonb_typeof(coalesce(p_payload->'inventory','[]'::jsonb)) <> 'array' then
        raise exception 'Invalid stock rows' using errcode = '22023';
      end if;
      if jsonb_array_length(coalesce(p_payload->'inventory','[]'::jsonb)) > 500 then
        raise exception 'Too many stock rows' using errcode = '22023';
      end if;
      -- Validate every scoped relation before creating the product or stock.
      for v_item in select value from jsonb_array_elements(
        coalesce(p_payload->'inventory','[]'::jsonb)) loop
        if exists (
          select 1 from jsonb_each(v_item) as stock_field(key, value)
          where key in ('amount', 'min_amount')
            and value <> 'null'::jsonb
            and (value #>> '{}')::numeric <> trunc((value #>> '{}')::numeric)
        ) then
          raise exception 'Stock values must be integers' using errcode = '22023';
        end if;
        perform 1 from private.inventory_units where ws_id = p_ws_id
          and id = (v_item->>'unit_id')::uuid for share;
        if not found then
          raise exception 'Invalid inventory unit' using errcode = '23503';
        end if;
        perform 1 from private.inventory_warehouses where ws_id = p_ws_id
          and id = (v_item->>'warehouse_id')::uuid for share;
        if not found then
          raise exception 'Invalid inventory warehouse' using errcode = '23503';
        end if;
        if nullif(v_item->>'revenue_share_partner_id','') is not null then
          perform 1 from private.inventory_owners where ws_id = p_ws_id
            and id = (v_item->>'revenue_share_partner_id')::uuid for share;
          if not found then
            raise exception 'Invalid revenue share partner' using errcode = '23503';
          end if;
        end if;
      end loop;
      insert into public.workspace_products
        (id, ws_id, name, category_id, owner_id, manufacturer_id,
          finance_category_id, avatar_url, description, usage)
        values (v_id, p_ws_id, v_name, (p_payload->>'category_id')::uuid,
          (p_payload->>'owner_id')::uuid,
          nullif(p_payload->>'manufacturer_id','')::uuid,
          nullif(p_payload->>'finance_category_id','')::uuid,
          p_payload->>'avatar_url', p_payload->>'description', p_payload->>'usage')
        returning to_jsonb(workspace_products.*) into v_data;
      for v_item in select value from jsonb_array_elements(
        coalesce(p_payload->'inventory','[]'::jsonb)) loop
        insert into private.inventory_products
          (product_id, unit_id, warehouse_id, amount, min_amount, price,
            revenue_share_partner_id, revenue_share_bps)
          values (v_id, (v_item->>'unit_id')::uuid,
            (v_item->>'warehouse_id')::uuid, (v_item->>'amount')::numeric,
            coalesce((v_item->>'min_amount')::numeric, 0),
            coalesce((v_item->>'price')::numeric, 0),
            nullif(v_item->>'revenue_share_partner_id','')::uuid,
            coalesce((v_item->>'revenue_share_bps')::integer, 0));
        if v_workspace_user_id is not null and
          coalesce((v_item->>'amount')::numeric, 0) <> 0 then
          insert into public.product_stock_changes
            (product_id, unit_id, warehouse_id, amount, creator_id)
            values (v_id, (v_item->>'unit_id')::uuid,
              (v_item->>'warehouse_id')::uuid, (v_item->>'amount')::numeric,
              v_workspace_user_id);
        end if;
      end loop;
      v_entity_kind := 'product';
    when 'period' then
      for v_product_id in select distinct value::uuid from jsonb_array_elements_text(
        coalesce(p_payload->'product_ids','[]'::jsonb)) loop
        perform 1 from public.workspace_products where ws_id = p_ws_id
          and id = v_product_id for share;
        if not found then
          raise exception 'Invalid period product' using errcode = '23503';
        end if;
      end loop;
      insert into private.inventory_sales_periods
        (id, ws_id, name, description, starts_at, ends_at, product_scope,
          pricing_mode, time_zone, created_by)
        values (v_id, p_ws_id, v_name, p_payload->>'description',
          (p_payload->>'starts_at')::date, (p_payload->>'ends_at')::date,
          coalesce(p_payload->>'product_scope','all'),
          coalesce(p_payload->>'pricing_mode','legacy'),
          p_payload->>'time_zone', p_actor_id)
        returning to_jsonb(inventory_sales_periods.*) into v_data;
      for v_product_id in select distinct value::uuid from jsonb_array_elements_text(
        coalesce(p_payload->'product_ids','[]'::jsonb)) loop
        insert into private.inventory_sales_period_products
          (ws_id, period_id, product_id) values (p_ws_id, v_id, v_product_id);
      end loop;
      v_data := v_data || jsonb_build_object('product_ids',
        coalesce(p_payload->'product_ids','[]'::jsonb), 'sale_count', 0);
      v_entity_kind := 'sales_period';
  end case;
  if v_entity_kind is not null then
    insert into private.inventory_audit_logs
      (ws_id, event_kind, entity_kind, entity_id, entity_label, summary,
        actor_auth_uid, actor_workspace_user_id, changed_fields, "after")
      values (p_ws_id, 'created', v_entity_kind, v_id, v_name,
        'Created ' || v_entity_kind || ' through offline sync',
        p_actor_id, v_workspace_user_id, array['name'], p_payload);
  end if;
  v_response := jsonb_build_object('contract', 'inventory-offline-create-v1',
    'resource', p_resource, 'data', v_data, 'replayed', false);
  insert into private.inventory_offline_create_receipts
    (actor_id, ws_id, operation_id, resource, request_payload, response)
    values (p_actor_id, p_ws_id, p_operation_id, p_resource, p_payload, v_response);
  return v_response;
end;
$$;
revoke all on function private.apply_inventory_offline_create(uuid,uuid,uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function private.apply_inventory_offline_create(uuid,uuid,uuid,text,jsonb)
  to service_role;
