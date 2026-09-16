begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(28);

insert into public.workspaces (id, name, personal, creator_id)
values (
  '00000000-0000-4000-8000-000000010001',
  'Referral reward test workspace',
  false,
  '00000000-0000-0000-0000-000000000001'
);

insert into public.workspace_users (id, ws_id, full_name, email)
values
  (
    '00000000-0000-4000-8000-000000010101',
    '00000000-0000-4000-8000-000000010001',
    'Referral referrer',
    'referrer@example.test'
  ),
  (
    '00000000-0000-4000-8000-000000010102',
    '00000000-0000-4000-8000-000000010001',
    'Referral receiver',
    'receiver@example.test'
  ),
  (
    '00000000-0000-4000-8000-000000010103',
    '00000000-0000-4000-8000-000000010001',
    'Referral extra receiver',
    'receiver-extra@example.test'
  ),
  (
    '00000000-0000-4000-8000-000000010104',
    '00000000-0000-4000-8000-000000010001',
    'Referral actor',
    'actor@example.test'
  );

insert into public.product_categories (id, name, ws_id)
values (
  '00000000-0000-4000-8000-000000010201',
  'Referral test category',
  '00000000-0000-4000-8000-000000010001'
);

insert into private.inventory_owners (id, ws_id, name)
values (
  '00000000-0000-4000-8000-000000010301',
  '00000000-0000-4000-8000-000000010001',
  'Referral test owner'
);

insert into public.workspace_products (
  id,
  category_id,
  name,
  owner_id,
  ws_id
)
values (
  '00000000-0000-4000-8000-000000010401',
  '00000000-0000-4000-8000-000000010201',
  'Referral test product',
  '00000000-0000-4000-8000-000000010301',
  '00000000-0000-4000-8000-000000010001'
);

insert into private.inventory_units (id, name, ws_id)
values (
  '00000000-0000-4000-8000-000000010501',
  'Referral test unit',
  '00000000-0000-4000-8000-000000010001'
);

insert into private.inventory_warehouses (id, name, ws_id)
values (
  '00000000-0000-4000-8000-000000010601',
  'Referral test warehouse',
  '00000000-0000-4000-8000-000000010001'
);

insert into private.inventory_products (
  product_id,
  unit_id,
  warehouse_id,
  amount,
  price
)
values (
  '00000000-0000-4000-8000-000000010401',
  '00000000-0000-4000-8000-000000010501',
  '00000000-0000-4000-8000-000000010601',
  10,
  100
);

insert into private.workspace_promotions (
  id,
  ws_id,
  name,
  code,
  value,
  use_ratio
)
values (
  '00000000-0000-4000-8000-000000010701',
  '00000000-0000-4000-8000-000000010001',
  'Receiver reward',
  'RECEIVER',
  25,
  true
);

insert into private.workspace_wallets(id, ws_id, name) values ('00000000-0000-4000-8000-000000010801', '00000000-0000-4000-8000-000000010001', 'Recovery wallet');
insert into public.transaction_categories(id, ws_id, name, is_expense) values ('00000000-0000-4000-8000-000000010802', '00000000-0000-4000-8000-000000010001', 'Recovery category', false);
insert into public.finance_invoices(id, ws_id, wallet_id, category_id, customer_id, price, note, notice) values (
'00000000-0000-4000-8000-000000010804', '00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010801', '00000000-0000-4000-8000-000000010802', '00000000-0000-4000-8000-000000010101', 100, 'Original note', 'Keep this notice');
update public.wallet_transactions set id = '00000000-0000-4000-8000-000000010803' where invoice_id = '00000000-0000-4000-8000-000000010804';
insert into public.finance_invoice_products(invoice_id, product_id, unit_id, warehouse_id, amount, price) values ('00000000-0000-4000-8000-000000010804', '00000000-0000-4000-8000-000000010401', '00000000-0000-4000-8000-000000010501', '00000000-0000-4000-8000-000000010601', 1, 100);
insert into public.finance_invoice_promotions(invoice_id, promo_id, code, value, use_ratio) values ('00000000-0000-4000-8000-000000010804', '00000000-0000-4000-8000-000000010701', 'RECEIVER', 25, true);

insert into public.workspace_user_groups(id, ws_id, name) values ('00000000-0000-4000-8000-000000010805', '00000000-0000-4000-8000-000000010001', 'Recovery group');
insert into public.finance_invoice_user_groups(invoice_id, user_group_id) values ('00000000-0000-4000-8000-000000010804', '00000000-0000-4000-8000-000000010805');
insert into public.transaction_tags(id, ws_id, name) values ('00000000-0000-4000-8000-000000010806', '00000000-0000-4000-8000-000000010001', 'Recovery tag');
insert into public.wallet_transaction_tags(transaction_id, tag_id) values ('00000000-0000-4000-8000-000000010803', '00000000-0000-4000-8000-000000010806');

select ok(not has_function_privilege('authenticated', 'public.admin_restore_finance_invoice(uuid,uuid,uuid)', 'execute'), 'Clients cannot impersonate a restore actor');
select ok(not has_function_privilege('anon', 'public.admin_get_finance_invoice_history(uuid,uuid,uuid,boolean,integer,integer,text)', 'execute'), 'Anonymous callers cannot read history');
select throws_ok($$select public.admin_delete_finance_invoice('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010804', '00000000-0000-4000-8000-000000019999')$$, '42501', 'Insufficient permissions', 'Nonmember cannot delete');
select ok(public.admin_update_finance_invoice('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010804', '00000000-0000-0000-0000-000000000001', '{"note":"Updated note"}'), 'Update succeeds');
select is((select notice from public.finance_invoices where id = '00000000-0000-4000-8000-000000010804'), 'Keep this notice', 'Partial updates preserve omitted fields');
select ok(public.admin_delete_finance_invoice('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010804', '00000000-0000-0000-0000-000000000001'), 'Atomic deletion succeeds');
select is((select count(*) from public.finance_invoice_products where invoice_id = '00000000-0000-4000-8000-000000010804'), 0::bigint, 'Line items removed');
select is((select count(*) from public.wallet_transactions where id = '00000000-0000-4000-8000-000000010803'), 0::bigint, 'Original payment removed');
select ok(exists(select 1 from jsonb_array_elements(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, true)) e where e->>'operation' = 'DELETE' and (e->>'can_restore')::boolean and e->>'actor_id' = '00000000-0000-0000-0000-000000000001'), 'Deleted audit record retains actor and recovery availability');
select ok(public.admin_restore_finance_invoice('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010804', '00000000-0000-0000-0000-000000000001'), 'Restore succeeds');
select is((select note from public.finance_invoices where id = '00000000-0000-4000-8000-000000010804'), 'Updated note', 'Invoice values preserved');
select is((select count(*) from public.finance_invoice_products where invoice_id = '00000000-0000-4000-8000-000000010804'), 1::bigint, 'Line items restored exactly once');
select is((select count(*) from public.finance_invoice_promotions where invoice_id = '00000000-0000-4000-8000-000000010804'), 1::bigint, 'Promotions restored');
select is((select invoice_id from public.wallet_transactions where id = '00000000-0000-4000-8000-000000010803'), '00000000-0000-4000-8000-000000010804'::uuid, 'Payment restored with original invoice link');
select ok(not public.admin_restore_finance_invoice('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010804', '00000000-0000-0000-0000-000000000001'), 'Duplicate restore does not duplicate payment');
select is((select amount::numeric from private.inventory_products where product_id = '00000000-0000-4000-8000-000000010401' and unit_id = '00000000-0000-4000-8000-000000010501' and warehouse_id = '00000000-0000-4000-8000-000000010601'), 9::numeric, 'Inventory quantity matches the original invoice');
select is((select count(*) from public.finance_invoice_user_groups where invoice_id = '00000000-0000-4000-8000-000000010804'), 1::bigint, 'Group links restored');
select is((select count(*) from public.wallet_transaction_tags where transaction_id = '00000000-0000-4000-8000-000000010803'), 1::bigint, 'Transaction tags restored');
select throws_ok($$select public.admin_restore_finance_invoice('00000000-0000-4000-8000-000000019999', '00000000-0000-4000-8000-000000010804', '00000000-0000-0000-0000-000000000001')$$, '42501', 'Insufficient permissions', 'Restore cannot cross workspace boundaries');
select ok(exists(select 1 from jsonb_array_elements(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001')) e where e->>'operation' = 'RESTORE'), 'History distinguishes restoration from creation');
select ok(public.admin_delete_finance_invoice('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010804', '00000000-0000-0000-0000-000000000001'), 'A restored invoice can be deleted again');
delete from public.transaction_tags where id = '00000000-0000-4000-8000-000000010806';
select throws_ok($$select public.admin_restore_finance_invoice('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010804', '00000000-0000-0000-0000-000000000001')$$, '23503', null, 'A stale tag fails recovery after inserts');
select is((select count(*) from public.finance_invoices where id = '00000000-0000-4000-8000-000000010804'), 0::bigint, 'Failed restoration rolls back the invoice');
select is((select count(*) from public.wallet_transactions where id = '00000000-0000-4000-8000-000000010803'), 0::bigint, 'Failed restoration rolls back the payment');
select ok(exists(select 1 from jsonb_array_elements(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001')) e where e->'changes'->'note'->>'before' = 'Original note' and e->'changes'->'note'->>'after' = 'Updated note'), 'History retains before and after values');
select is(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 25, 'no-matching-invoice'), '[]'::jsonb, 'Search filters history');
insert into public.finance_invoices(id, ws_id, wallet_id, category_id, price) values ('00000000-0000-4000-8000-000000010807', '00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010801', '00000000-0000-4000-8000-000000010802', 50);
delete from public.finance_invoices where id = '00000000-0000-4000-8000-000000010807';
select ok(exists(select 1 from jsonb_array_elements(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', '00000000-0000-4000-8000-000000010807', true)) e where e->>'operation' = 'DELETE' and not (e->>'can_restore')::boolean), 'Historical deletions without snapshots remain visible without offering unsafe restore');
select throws_ok($$select public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000019999')$$, '42501', 'Insufficient permissions', 'History rejects unrelated actors');
select * from finish();
rollback;
