-- Preserve a complete recovery snapshot before the application deletes an invoice.
-- Only service-role RPCs may access snapshots; API routes authorize the actor.
create table private.finance_invoice_recovery (
  invoice_id uuid primary key,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  snapshot jsonb not null,
  deleted_at timestamptz not null default now(),
  deleted_by uuid references public.users(id) on delete set null,
  restored_at timestamptz,
  restore_history timestamptz[] not null default '{}',
  restored_by uuid references public.users(id) on delete set null
);
alter table private.finance_invoice_recovery enable row level security;
revoke all on private.finance_invoice_recovery from public, anon, authenticated;
grant all on private.finance_invoice_recovery to service_role;

select audit.enable_tracking('public.finance_invoices'::regclass);
select audit.enable_tracking('public.finance_invoice_products'::regclass);
select audit.enable_tracking('public.finance_invoice_user_groups'::regclass);

create index if not exists invoice_audit_workspace_time_idx
on audit.record_version ((coalesce(record->>'ws_id', old_record->>'ws_id')), ts desc, id desc)
where table_name = 'finance_invoices';

create or replace function public.admin_delete_finance_invoice(
  p_ws_id uuid, p_invoice_id uuid, p_actor_id uuid
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  invoice public.finance_invoices;
  transaction_ids uuid[];
  snapshot jsonb;
  dependency record;
  linked boolean;
begin
  if not public.has_workspace_permission(p_ws_id, p_actor_id, 'delete_invoices') then
    raise insufficient_privilege using message = 'Insufficient permissions';
  end if;
  select * into invoice from public.finance_invoices
    where id = p_invoice_id and ws_id = p_ws_id for update;
  if not found then return false; end if;
  -- Lock children before taking the snapshot. Inserts serialize on the parent FK.
  perform 1 from public.finance_invoice_products where invoice_id = p_invoice_id for update;
  perform 1 from public.finance_invoice_promotions where invoice_id = p_invoice_id for update;
  perform 1 from public.finance_invoice_user_groups where invoice_id = p_invoice_id for update;
  perform 1 from public.wallet_transactions
    where id = invoice.transaction_id or invoice_id = p_invoice_id for update;
  select coalesce(array_agg(id), '{}'::uuid[]) into transaction_ids
    from public.wallet_transactions where id = invoice.transaction_id or invoice_id = p_invoice_id;
  perform 1 from public.wallet_transaction_tags where transaction_id = any(transaction_ids) for update;
  -- Do not erase unrelated transfers, debt payments, sale links, or another invoice.
  for dependency in
    select c.conrelid::regclass as relation, a.attname as column_name
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.wallet_transactions'::regclass
      and c.conrelid not in ('public.wallet_transaction_tags'::regclass, 'public.finance_invoices'::regclass)
  loop
    execute format('select exists(select 1 from %s where %I = any($1))', dependency.relation, dependency.column_name)
      into linked using transaction_ids;
    if linked then raise exception 'Invoice transaction has linked records' using errcode = '23503'; end if;
  end loop;
  if exists(select 1 from public.finance_invoices where transaction_id = any(transaction_ids) and id <> p_invoice_id) then
    raise exception 'Invoice transaction is shared' using errcode = '23503';
  end if;
  select jsonb_build_object(
    'invoice', to_jsonb(invoice),
    'products', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.finance_invoice_products p where invoice_id = p_invoice_id),
    'promotions', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.finance_invoice_promotions p where invoice_id = p_invoice_id),
    'groups', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.finance_invoice_user_groups p where invoice_id = p_invoice_id),
    'transactions', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.wallet_transactions p where id = any(transaction_ids)),
    'tags', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.wallet_transaction_tags p where transaction_id = any(transaction_ids))
  ) into snapshot;
  perform set_config('audit.override_auth_uid', p_actor_id::text, true);
  insert into private.finance_invoice_recovery(invoice_id, ws_id, snapshot, deleted_by)
    values (p_invoice_id, p_ws_id, snapshot, p_actor_id)
    on conflict (invoice_id) do update set snapshot = excluded.snapshot,
      deleted_at = now(), deleted_by = excluded.deleted_by, restored_at = null, restored_by = null;
  delete from public.finance_invoice_products where invoice_id = p_invoice_id;
  delete from public.finance_invoice_promotions where invoice_id = p_invoice_id;
  delete from public.finance_invoices where id = p_invoice_id and ws_id = p_ws_id;
  return true;
end;
$$;

create or replace function public.admin_restore_finance_invoice(
  p_ws_id uuid, p_invoice_id uuid, p_actor_id uuid
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  recovery private.finance_invoice_recovery;
  item jsonb;
  invoice public.finance_invoices;
begin
  if not public.has_workspace_permission(p_ws_id, p_actor_id, 'create_invoices')
    or not public.has_workspace_permission(p_ws_id, p_actor_id, 'delete_invoices')
    or not public.has_workspace_permission(p_ws_id, p_actor_id, 'view_invoices') then
    raise insufficient_privilege using message = 'Insufficient permissions';
  end if;
  select * into recovery from private.finance_invoice_recovery
    where invoice_id = p_invoice_id and ws_id = p_ws_id for update;
  if not found or recovery.restored_at is not null then return false; end if;
  invoice := jsonb_populate_record(null::public.finance_invoices, recovery.snapshot->'invoice');
  -- Validate workspace ownership again: references may have changed since deletion.
  if not exists(select 1 from private.workspace_wallets where id = invoice.wallet_id and ws_id = p_ws_id)
    or (invoice.customer_id is not null and not exists(select 1 from public.workspace_users where id = invoice.customer_id and ws_id = p_ws_id)) then
    raise exception 'Invoice references are no longer available' using errcode = '23503';
  end if;
  if not exists(select 1 from public.transaction_categories where id = invoice.category_id and ws_id = p_ws_id)
    or exists(select 1 from jsonb_array_elements(recovery.snapshot->'transactions') t
      where not exists(select 1 from private.workspace_wallets w where w.id = (t->>'wallet_id')::uuid and w.ws_id = p_ws_id))
    or exists(select 1 from jsonb_array_elements(recovery.snapshot->'groups') g
      where not exists(select 1 from public.workspace_user_groups u where u.id = (g->>'user_group_id')::uuid and u.ws_id = p_ws_id))
    or exists(select 1 from jsonb_array_elements(recovery.snapshot->'products') p
      where p->>'product_id' is not null and not exists(select 1 from public.workspace_products w where w.id = (p->>'product_id')::uuid and w.ws_id = p_ws_id)) then
    raise exception 'Invoice references are no longer available' using errcode = '23503';
  end if;
  perform set_config('audit.override_auth_uid', p_actor_id::text, true);
  -- Break the invoice/transaction FK cycle while retaining original identifiers.
  for item in select value from jsonb_array_elements(recovery.snapshot->'transactions') loop
    insert into public.wallet_transactions
      select * from jsonb_populate_record(null::public.wallet_transactions, item || '{"invoice_id":null}'::jsonb);
  end loop;
  perform set_config('finance.restoring_invoice', p_invoice_id::text, true);
  insert into public.finance_invoices select invoice.*;
  perform set_config('finance.restoring_invoice', '', true);
  for item in select value from jsonb_array_elements(recovery.snapshot->'transactions') loop
    update public.wallet_transactions set invoice_id = (item->>'invoice_id')::uuid where id = (item->>'id')::uuid;
  end loop;
  insert into public.finance_invoice_products select * from jsonb_populate_recordset(null::public.finance_invoice_products, recovery.snapshot->'products');
  insert into public.finance_invoice_promotions select * from jsonb_populate_recordset(null::public.finance_invoice_promotions, recovery.snapshot->'promotions');
  insert into public.finance_invoice_user_groups select * from jsonb_populate_recordset(null::public.finance_invoice_user_groups, recovery.snapshot->'groups');
  insert into public.wallet_transaction_tags select * from jsonb_populate_recordset(null::public.wallet_transaction_tags, recovery.snapshot->'tags');
  update private.finance_invoice_recovery set restored_at = now(), restored_by = p_actor_id, restore_history = array_append(restore_history, now())
    where invoice_id = p_invoice_id;
  return true;
end;
$$;

-- Read the underlying audit table: the legacy view filters DELETE records out.
create or replace function public.admin_get_finance_invoice_history(
  p_ws_id uuid, p_actor_id uuid, p_invoice_id uuid default null,
  p_deleted_only boolean default false, p_offset integer default 0, p_limit integer default 25,
  p_query text default ''
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.has_workspace_permission(p_ws_id, p_actor_id, 'view_invoices')
    or not public.has_workspace_permission(p_ws_id, p_actor_id, 'manage_workspace_audit_logs') then
    raise insufficient_privilege using message = 'Insufficient permissions';
  end if;
  select coalesce(jsonb_agg(to_jsonb(entries)), '[]'::jsonb) into result from (
    select a.id::text, a.ts as occurred_at, case when a.op = 'INSERT' and a.ts = any(r.restore_history) then 'RESTORE' else a.op::text end as operation,
      coalesce(a.record->>'id', a.old_record->>'id') as invoice_id,
      u.display_name as actor_name,
      coalesce(a.auth_uid, case when a.op = 'INSERT' then (a.record->>'platform_creator_id')::uuid end) as actor_id,
      coalesce(a.record->>'customer_id', a.old_record->>'customer_id') as customer_id,
      customer.full_name as customer_name,
      array(select key from jsonb_each(coalesce(a.record, a.old_record)) where
        a.op <> 'UPDATE' or a.record->key is distinct from a.old_record->key) as changed_fields,
      coalesce((select jsonb_object_agg(key, jsonb_build_object('before', a.old_record->key, 'after', a.record->key))
        from jsonb_each(a.record) where a.op = 'UPDATE' and key in ('note', 'notice', 'wallet_id')
          and a.record->key is distinct from a.old_record->key), '{}'::jsonb) as changes,
      r.invoice_id is not null and r.restored_at is null and a.op = 'DELETE'
        and not exists(select 1 from public.finance_invoices f where f.id = r.invoice_id)
        and a.ts >= r.deleted_at as can_restore
    from audit.record_version a
    left join public.users u on u.id = coalesce(a.auth_uid, case when a.op = 'INSERT' then (a.record->>'platform_creator_id')::uuid end)
    left join public.workspace_users customer on customer.id = coalesce(a.record->>'customer_id', a.old_record->>'customer_id')::uuid and customer.ws_id = p_ws_id
    left join private.finance_invoice_recovery r on r.invoice_id = coalesce(a.record->>'id', a.old_record->>'id')::uuid and r.ws_id = p_ws_id
    where a.table_name = 'finance_invoices'
      and coalesce(a.record->>'ws_id', a.old_record->>'ws_id') = p_ws_id::text
      and (p_invoice_id is null or coalesce(a.record->>'id', a.old_record->>'id') = p_invoice_id::text)
      and (not p_deleted_only or (a.op = 'DELETE' and not exists(
        select 1 from public.finance_invoices f where f.id = (a.old_record->>'id')::uuid)))
      and (coalesce(p_query, '') = '' or customer.full_name ilike '%' || left(p_query, 120) || '%'
        or coalesce(a.record->>'id', a.old_record->>'id') ilike '%' || left(p_query, 120) || '%')
    order by a.ts desc, a.id desc
    offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 100)
  ) entries;
  return result;
end;
$$;

revoke all on function public.admin_delete_finance_invoice(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_restore_finance_invoice(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_get_finance_invoice_history(uuid, uuid, uuid, boolean, integer, integer, text) from public, anon, authenticated;
grant execute on function public.admin_delete_finance_invoice(uuid, uuid, uuid) to service_role;
grant execute on function public.admin_restore_finance_invoice(uuid, uuid, uuid) to service_role;
grant execute on function public.admin_get_finance_invoice_history(uuid, uuid, uuid, boolean, integer, integer, text) to service_role;

create or replace function public.admin_update_finance_invoice(
  p_ws_id uuid, p_invoice_id uuid, p_actor_id uuid, p_payload jsonb
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare invoice public.finance_invoices;
begin
  if not public.has_workspace_permission(p_ws_id, p_actor_id, 'update_invoices') then
    raise insufficient_privilege using message = 'Insufficient permissions';
  end if;
  select * into invoice from public.finance_invoices where id = p_invoice_id and ws_id = p_ws_id for update;
  if not found then return false; end if;
  if p_payload ? 'wallet_id' and (p_payload->>'wallet_id')::uuid is distinct from invoice.wallet_id then
    if not public.has_workspace_permission(p_ws_id, p_actor_id, 'change_finance_wallets') then
      raise insufficient_privilege using message = 'Insufficient wallet permissions';
    end if;
    if not exists(select 1 from private.workspace_wallets where id = (p_payload->>'wallet_id')::uuid and ws_id = p_ws_id) then
      raise exception 'Invalid wallet' using errcode = '23503';
    end if;
  end if;
  perform set_config('audit.override_auth_uid', p_actor_id::text, true);
  update public.finance_invoices set
    note = case when p_payload ? 'note' then p_payload->>'note' else note end,
    notice = case when p_payload ? 'notice' then p_payload->>'notice' else notice end,
    wallet_id = case when p_payload ? 'wallet_id' then (p_payload->>'wallet_id')::uuid else wallet_id end
  where id = p_invoice_id and ws_id = p_ws_id;
  return true;
end;
$$;
revoke all on function public.admin_update_finance_invoice(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_finance_invoice(uuid, uuid, uuid, jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.sync_invoice_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  new_transaction_id uuid;
begin
  -- Only privileged recovery may reuse an original payment instead of minting another.
  if current_setting('finance.restoring_invoice', true) = NEW.id::text
    and pg_has_role(current_user, 'service_role', 'USAGE') then
    return NEW;
  end if;
  if (TG_OP = 'INSERT') then
    INSERT INTO public.wallet_transactions (amount, description, wallet_id, invoice_id, category_id, creator_id, created_at, taken_at)
    VALUES (NEW.price + NEW.total_diff, NEW.notice, NEW.wallet_id, NEW.id, NEW.category_id, NEW.creator_id, NEW.created_at, NEW.created_at)
    RETURNING id INTO new_transaction_id;

    UPDATE public.finance_invoices
    SET transaction_id = new_transaction_id
    WHERE id = NEW.id;
  elsif (TG_OP = 'UPDATE') then
    UPDATE public.wallet_transactions
    SET amount = NEW.price + NEW.total_diff,
        description = NEW.notice,
        wallet_id = NEW.wallet_id,
        category_id = NEW.category_id,
        creator_id = NEW.creator_id,
        created_at = NEW.created_at
    WHERE id = NEW.transaction_id;
  elsif (TG_OP = 'DELETE') then
    DELETE FROM public.wallet_transactions
    WHERE id = OLD.transaction_id;
  end if;
  RETURN NEW;
end;
$function$
;


-- Recovery RPCs use an empty search path; legacy triggers must qualify tables.
create or replace function public.delete_wallet_transaction()
returns trigger language plpgsql set search_path = '' as $$
begin
  delete from public.wallet_transactions where id = old.transaction_id;
  return old;
end;
$$;
