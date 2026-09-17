-- Event-first reads keep the existing RPC contract during rolling deployments.
-- A limit of 101 supports lookahead for a public page size capped at 100.
create or replace function public.admin_get_finance_invoice_history(
  p_ws_id uuid, p_actor_id uuid, p_invoice_id uuid default null,
  p_deleted_only boolean default false, p_offset integer default 0, p_limit integer default 25,
  p_query text default '', p_entity text default null, p_action text default null,
  p_from timestamptz default null, p_to timestamptz default null, p_sort text default 'desc'
) returns jsonb
language plpgsql security definer set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare result jsonb;
begin
  if not public.has_workspace_permission(p_ws_id, p_actor_id, 'view_invoices')
    or not public.has_workspace_permission(p_ws_id, p_actor_id, 'manage_workspace_audit_logs') then
    raise insufficient_privilege using message = 'Insufficient permissions';
  end if;
  -- Start with events, not all historical versions of every invoice. The ordered
  -- partial indexes allow LIMIT to stop scanning as soon as a page is found.
  with events as (
    select v.*, coalesce(v.record, v.old_record) as invoice, 'invoice'::text as entity_type
    from audit.record_version v
    where v.table_name = 'finance_invoices'
      and coalesce(v.record->>'ws_id', v.old_record->>'ws_id') = p_ws_id::text
      and (p_entity is null or p_entity = 'invoice')
      and (not p_deleted_only or v.op = 'DELETE')
    union all
    select v.*, context.invoice,
      case v.table_name
        when 'finance_invoice_products' then 'product'
        when 'finance_invoice_promotions' then 'promotion'
        when 'finance_invoice_user_groups' then 'group'
        else 'payment' end
    from audit.record_version v
    cross join lateral (
      select coalesce(parent.record, parent.old_record) as invoice
      from audit.record_version parent
      where parent.table_name = 'finance_invoices'
        and coalesce(parent.record->>'ws_id', parent.old_record->>'ws_id') = p_ws_id::text
        and coalesce(parent.record->>'id', parent.old_record->>'id') = coalesce(v.record->>'invoice_id', v.old_record->>'invoice_id')
      order by parent.ts desc, parent.id desc limit 1
    ) context
    where not p_deleted_only
      and v.table_name in ('finance_invoice_products', 'finance_invoice_promotions', 'finance_invoice_user_groups', 'wallet_transactions')
      and (p_entity is null or v.table_name = case p_entity
        when 'product' then 'finance_invoice_products'
        when 'promotion' then 'finance_invoice_promotions'
        when 'group' then 'finance_invoice_user_groups'
        when 'payment' then 'wallet_transactions' end)
    union all
    -- Legacy payments can be linked from the invoice without an invoice_id.
    select v.*, context.invoice, 'payment'::text
    from audit.record_version v
    cross join lateral (
      select coalesce(parent.record, parent.old_record) as invoice
      from audit.record_version parent
      where parent.table_name = 'finance_invoices'
        and coalesce(parent.record->>'ws_id', parent.old_record->>'ws_id') = p_ws_id::text
        and coalesce(parent.record->>'transaction_id', parent.old_record->>'transaction_id') = coalesce(v.record->>'id', v.old_record->>'id')
      order by parent.ts desc, parent.id desc limit 1
    ) context
    where not p_deleted_only and v.table_name = 'wallet_transactions'
      and (p_entity is null or p_entity = 'payment')
      and coalesce(v.record->>'invoice_id', v.old_record->>'invoice_id') is distinct from context.invoice->>'id'
  ), entries as (
    select a.id::text, a.id as sort_id, a.ts as occurred_at,
      case when a.table_name = 'finance_invoices' and a.op = 'INSERT' and a.ts = any(r.restore_history)
        then 'RESTORE' else a.op::text end as operation,
      a.entity_type, a.invoice->>'id' as invoice_id,
      u.display_name as actor_name,
      coalesce(a.auth_uid, case when a.table_name = 'finance_invoices' and a.op = 'INSERT' then (a.record->>'platform_creator_id')::uuid end) as actor_id,
      a.invoice->>'customer_id' as customer_id, customer.full_name as customer_name,
      (a.invoice->>'price')::numeric + coalesce((a.invoice->>'total_diff')::numeric, 0) as amount,
      wallet.currency,
      not exists(select 1 from public.finance_invoices f where f.id = (a.invoice->>'id')::uuid) as is_deleted,
      array(select key from jsonb_each(coalesce(a.record, a.old_record)) where
        a.op <> 'UPDATE' or a.record->key is distinct from a.old_record->key) as changed_fields,
      coalesce((select jsonb_object_agg(key, jsonb_build_object('before', a.old_record->key, 'after', a.record->key))
        from jsonb_each(coalesce(a.record, a.old_record))
        where key in ('note', 'notice', 'wallet_id', 'category_id', 'customer_id', 'price', 'total_diff', 'paid_amount',
          'completed_at', 'valid_until', 'product_name', 'product_unit', 'product_id', 'unit_id', 'warehouse_id',
          'amount', 'owner_name', 'promo_id', 'value', 'use_ratio', 'name', 'code', 'description', 'user_group_id', 'taken_at')
          and (a.op <> 'UPDATE' or a.record->key is distinct from a.old_record->key)), '{}'::jsonb) as changes,
      r.invoice_id is not null and r.restored_at is null and a.table_name = 'finance_invoices' and a.op = 'DELETE'
        and not exists(select 1 from public.finance_invoices f where f.id = r.invoice_id)
        and a.ts >= r.deleted_at as can_restore
    from events a
    left join public.users u on u.id = coalesce(a.auth_uid,
      case when a.table_name = 'finance_invoices' and a.op = 'INSERT' then (a.record->>'platform_creator_id')::uuid end)
    left join public.workspace_users customer on customer.id = (a.invoice->>'customer_id')::uuid and customer.ws_id = p_ws_id
    left join private.workspace_wallets wallet on wallet.id = (a.invoice->>'wallet_id')::uuid and wallet.ws_id = p_ws_id
    left join private.finance_invoice_recovery r on r.invoice_id = (a.invoice->>'id')::uuid and r.ws_id = p_ws_id
    where (p_from is null or a.ts >= p_from) and (p_to is null or a.ts <= p_to)
      and (p_invoice_id is null or a.invoice->>'id' = p_invoice_id::text)
      and (coalesce(p_query, '') = '' or customer.full_name ilike '%' || left(p_query, 120) || '%'
        or a.invoice->>'id' ilike '%' || left(p_query, 120) || '%'
        or u.display_name ilike '%' || left(p_query, 120) || '%')
  )
  select coalesce(jsonb_agg(to_jsonb(page) - 'sort_id'), '[]'::jsonb) into result from (
    select * from entries
    where (p_action is null or operation = p_action)
      and (not p_deleted_only or (entity_type = 'invoice' and operation = 'DELETE' and is_deleted))
    order by
      case when p_sort = 'asc' then occurred_at end asc,
      case when p_sort = 'asc' then sort_id end asc,
      case when p_sort <> 'asc' then occurred_at end desc,
      case when p_sort <> 'asc' then sort_id end desc
    offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 101)
  ) page;
  return result;
end;
$$;
