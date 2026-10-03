-- A GUC is caller-controlled and cannot authorize inserting historical aliases.
-- This private, ungranted capability exists only during the authorized restore RPC.
create table private.inventory_invoice_restore_context (
 backend_pid integer not null,
 transaction_id bigint not null,
 invoice_id uuid not null,
 primary key (backend_pid, transaction_id, invoice_id)
);
alter table private.inventory_invoice_restore_context enable row level security;
revoke all on private.inventory_invoice_restore_context from public, anon, authenticated, service_role;

create or replace function private.reject_merged_inventory_reference() returns trigger
language plpgsql security definer set search_path=pg_catalog,private,public as $$
declare v_kind text; v_id uuid; v_old jsonb; v_restore boolean := false;
begin
 if tg_op='UPDATE' then v_old:=to_jsonb(old); end if;
 if tg_op='INSERT' and tg_relid='public.finance_invoice_products'::regclass then
  -- Require an exact original line, still-pending recovery and workspace parent.
  select exists (
   select 1 from private.inventory_invoice_restore_context c
   join private.finance_invoice_recovery r on r.invoice_id=c.invoice_id
   join public.finance_invoices i on i.id=r.invoice_id and i.ws_id=r.ws_id
   where c.backend_pid=pg_backend_pid() and c.transaction_id=txid_current()
    and c.invoice_id=(to_jsonb(new)->>'invoice_id')::uuid and r.restored_at is null
    and exists(select 1 from jsonb_array_elements(r.snapshot->'products') x where x=to_jsonb(new))
  ) into v_restore;
 end if;
 for v_kind in select unnest(array['product','warehouse']) loop
  v_id:=nullif(to_jsonb(new)->>(v_kind||'_id'),'')::uuid;
  if v_id is not null and (tg_op='INSERT' or (v_old->>(v_kind||'_id')) is distinct from v_id::text)
   and not v_restore
   and exists(select 1 from private.inventory_identity_merges where kind=v_kind and source_id=v_id) then
   raise exception 'Inventory identity was merged; refresh and select its destination before retrying'
    using errcode='23514';
  end if;
 end loop;
 return new;
end; $$;

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
  -- Only this SECURITY DEFINER RPC can create the transaction/backend capability.
  insert into private.inventory_invoice_restore_context(backend_pid, transaction_id, invoice_id)
    values (pg_catalog.pg_backend_pid(), pg_catalog.txid_current(), p_invoice_id);
  insert into public.finance_invoice_products select * from jsonb_populate_recordset(null::public.finance_invoice_products, recovery.snapshot->'products');
  delete from private.inventory_invoice_restore_context
    where backend_pid = pg_catalog.pg_backend_pid() and transaction_id = pg_catalog.txid_current()
      and invoice_id = p_invoice_id;
  insert into public.finance_invoice_promotions select * from jsonb_populate_recordset(null::public.finance_invoice_promotions, recovery.snapshot->'promotions');
  insert into public.finance_invoice_user_groups select * from jsonb_populate_recordset(null::public.finance_invoice_user_groups, recovery.snapshot->'groups');
  insert into public.wallet_transaction_tags select * from jsonb_populate_recordset(null::public.wallet_transaction_tags, recovery.snapshot->'tags');
  update private.finance_invoice_recovery set restored_at = now(), restored_by = p_actor_id, restore_history = array_append(restore_history, now())
    where invoice_id = p_invoice_id;
  return true;
end;
$$;
