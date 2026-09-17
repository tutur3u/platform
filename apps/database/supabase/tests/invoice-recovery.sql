begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(59);

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
select ok(not has_function_privilege('anon', 'public.admin_get_finance_invoice_history(uuid,uuid,uuid,boolean,integer,integer,text,text,text,timestamptz,timestamptz,text)', 'execute'), 'Anonymous callers cannot read history');
select throws_ok($$select public.admin_delete_finance_invoice('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010804', '00000000-0000-4000-8000-000000019999')$$, '42501', 'Insufficient permissions', 'Nonmember cannot delete');
select ok(public.admin_update_finance_invoice('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010804', '00000000-0000-0000-0000-000000000001', '{"note":"Updated note"}'), 'Update succeeds');
select is((select notice from public.finance_invoices where id = '00000000-0000-4000-8000-000000010804'), 'Keep this notice', 'Partial updates preserve omitted fields');
update public.finance_invoice_promotions set value=30 where invoice_id='00000000-0000-4000-8000-000000010804';
select ok(exists(select 1 from jsonb_array_elements(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 100, '', 'promotion', 'UPDATE')) e where e->'changes'->'value'->>'before'='25' and e->'changes'->'value'->>'after'='30'), 'Discount changes retain before and after values');
select ok(exists(select 1 from jsonb_array_elements(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 100, '', 'product')) e where e->>'entity_type'='product'), 'Line item history is available');
select ok(exists(select 1 from jsonb_array_elements(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 100, '', 'payment')) e where e->>'entity_type'='payment'), 'Original payment history is available');
select is(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 25, '', null, null, now()+interval '1 day'), '[]'::jsonb, 'Date filters exclude older events');
select ok((public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 100, '', null, null, null, null, 'asc')->0->>'id')::bigint < (public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 100, '', null, null, null, null, 'desc')->0->>'id')::bigint, 'Sort direction uses stable event IDs within equal timestamps');
select ok(public.admin_delete_finance_invoice('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010804', '00000000-0000-0000-0000-000000000001'), 'Atomic deletion succeeds');
select is((select count(*) from public.finance_invoice_products where invoice_id = '00000000-0000-4000-8000-000000010804'), 0::bigint, 'Line items removed');
select is((select count(*) from public.wallet_transactions where id = '00000000-0000-4000-8000-000000010803'), 0::bigint, 'Original payment removed');
select ok(exists(select 1 from jsonb_array_elements(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, true)) e where e->>'operation' = 'DELETE' and (e->>'can_restore')::boolean and e->>'actor_id' = '00000000-0000-0000-0000-000000000001'), 'Deleted audit record retains actor and recovery availability');
select ok(exists(select 1 from jsonb_array_elements(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, true)) e where (e->>'is_deleted')::boolean and (e->>'amount')::numeric = 100 and e->>'currency' is not null), 'Deletion review includes amount, currency, and current deletion state');
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
-- A large historical population must not be expanded into decorated JSON before
-- selecting one page. Equal timestamps also exercise deterministic page boundaries.
insert into audit.record_version(record_id, old_record_id, op, ts, table_oid, table_schema, table_name, old_record)
select null, gen_random_uuid(), 'DELETE', '2025-01-01'::timestamptz,
 'public.finance_invoices'::regclass, 'public', 'finance_invoices',
 jsonb_build_object('id', gen_random_uuid(), 'ws_id', '00000000-0000-4000-8000-000000010001', 'price', n)
from generate_series(1, 20000) n;
analyze audit.record_version;
create temporary table history_pages as
select public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, true, 0, 26) first_page,
 public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, true, 25, 26) second_page,
 public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, true, 0, 26, '', null, null, null, null, 'asc') oldest_page;
select is((select jsonb_array_length(first_page) from history_pages), 26, 'Page includes one lookahead event');
select is((select first_page->25->>'id' from history_pages), (select second_page->0->>'id' from history_pages), 'Lookahead becomes the first event of the next page');
select ok(not exists(select 1 from history_pages, jsonb_array_elements(first_page - 25) a, jsonb_array_elements(second_page) b where a->>'id'=b->>'id'), 'Adjacent pages do not repeat events');
select ok((select (oldest_page->0->>'id')::bigint < (oldest_page->1->>'id')::bigint from history_pages), 'Oldest first uses a stable ID tiebreaker');
select is(jsonb_array_length(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, true, 0, 101)), 101, 'Maximum page supports lookahead at 100 rows');
select is(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, true, 0, 25, '', null, null, '2025-02-01', '2025-03-01'), '[]'::jsonb, 'Date range excludes historical rows');
select performs_ok($$select public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, true, 0, 26)$$, 1000, 'Deleted history page remains below one second with 20000 historical invoices');
select performs_ok($$select public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 26)$$, 1000, 'All activity page remains below one second with 20000 historical invoices');
-- Exercise linked-event fanout, not only invoice snapshots. Without a matching
-- workspace + invoice id index each child rescans thousands of parent versions.
insert into audit.record_version(record_id, op, ts, table_oid, table_schema, table_name, record)
select gen_random_uuid(), 'INSERT', v.ts + interval '1 second',
 'public.finance_invoice_promotions'::regclass, 'public', 'finance_invoice_promotions',
 jsonb_build_object('invoice_id', v.old_record->>'id', 'value', 10, 'use_ratio', true)
from audit.record_version v
where v.table_name = 'finance_invoices' and v.ts = '2025-01-01'::timestamptz
 and v.old_record->>'ws_id' = '00000000-0000-4000-8000-000000010001';
analyze audit.record_version;
select performs_ok($$select public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 26)$$, 1000, 'All activity remains fast with 20000 linked discount events');
select performs_ok($$select public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 26, '', 'promotion', 'INSERT')$$, 1000, 'Discount filtering remains fast with 20000 linked events');
select is(jsonb_array_length(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 26, '', 'promotion', 'INSERT')), 26, 'Discount page includes a lookahead event');
select ok(not exists(select 1 from jsonb_array_elements(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 26, '', 'promotion', 'INSERT')) e where e->>'entity_type' <> 'promotion' or e->>'operation' <> 'INSERT'), 'Linked page preserves entity and action filters');
-- Production has sparse discount/group events mixed with many line-item writes.
-- A page must not sort and decorate this entire population, or scan unrelated
-- tables merely because a rare entity cannot fill a page.
insert into audit.record_version(record_id, op, ts, table_oid, table_schema, table_name, record)
select gen_random_uuid(), 'INSERT', '2026-01-01'::timestamptz + n * interval '1 millisecond',
 'public.finance_invoice_products'::regclass, 'public', 'finance_invoice_products',
 jsonb_build_object('invoice_id', '00000000-0000-4000-8000-000000010804',
   'product_name', repeat('Mixed audit fixture ', 20), 'price', n, 'amount', 1)
from generate_series(1, 150000) n;
analyze audit.record_version;
select performs_ok($$select public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 26)$$, 1000, 'All activity stops before expanding 150000 line-item events');
select performs_ok($$select public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 26, '', 'group')$$, 1000, 'Sparse group history does not scan unrelated line-item events');
select performs_ok($$select public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 26, '', 'promotion', 'UPDATE')$$, 1000, 'Sparse discount changes avoid the mixed-table time index');
create temporary table mixed_history_pages as
select public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 26) first_page,
 public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 25, 26) second_page;
select is((select first_page->25->>'id' from mixed_history_pages), (select second_page->0->>'id' from mixed_history_pages), 'Mixed source lookahead becomes the next page first event');
select ok(not exists(select 1 from mixed_history_pages, jsonb_array_elements(first_page - 25) a, jsonb_array_elements(second_page) b where a->>'id'=b->>'id'), 'Mixed source pages do not repeat events');
select ok(jsonb_array_length(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 1, '00000000-0000-4000-8000-000000010807')) = 1, 'Search is applied before limiting each source');
select ok(jsonb_array_length(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 1, '', null, 'RESTORE')) = 1, 'Restore action filtering is applied before pagination');
select is(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, true, 0, 26, '', 'promotion'), '[]'::jsonb, 'Deleted-only review never admits child events');

-- Legacy payments without invoice_id still resolve through the invoice's
-- transaction_id. Directly linked payments must never enter that fallback.
insert into audit.record_version(record_id, op, ts, table_oid, table_schema, table_name, record)
values (gen_random_uuid(), 'INSERT', '2024-01-01', 'public.finance_invoices'::regclass, 'public', 'finance_invoices',
 '{"id":"00000000-0000-4000-8000-000000010999","ws_id":"00000000-0000-4000-8000-000000010001","transaction_id":"00000000-0000-4000-8000-000000011000","price":40}');
insert into audit.record_version(record_id, old_record_id, op, ts, table_oid, table_schema, table_name, record, old_record)
select case when op <> 'DELETE' then gen_random_uuid() end, case when op <> 'INSERT' then gen_random_uuid() end, op::audit.operation, '2024-01-02'::timestamptz + n * interval '1 second',
 'public.wallet_transactions'::regclass, 'public', 'wallet_transactions',
 case when op <> 'DELETE' then '{"id":"00000000-0000-4000-8000-000000011000","amount":40}'::jsonb end,
 case when op <> 'INSERT' then '{"id":"00000000-0000-4000-8000-000000011000","amount":30}'::jsonb end
from (values (1, 'INSERT'), (2, 'UPDATE'), (3, 'DELETE')) events(n, op);
create temporary table legacy_payment_history as
select public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', '00000000-0000-4000-8000-000000010999', false, 0, 26, '', 'payment') events;
select is((select jsonb_array_length(events) from legacy_payment_history), 3, 'Legacy payments remain visible without a direct invoice link');
select is((select array_agg(e->>'operation' order by e->>'operation') from legacy_payment_history, jsonb_array_elements(events) e), array['DELETE', 'INSERT', 'UPDATE'], 'Legacy payment create, update and delete history remains complete');
select ok(exists(select 1 from legacy_payment_history, jsonb_array_elements(events) e where e->>'operation' = 'UPDATE' and e->'changes'->'amount'->>'before' = '30' and e->'changes'->'amount'->>'after' = '40'), 'Legacy payment updates preserve before and after amounts');
insert into audit.record_version(record_id, op, ts, table_oid, table_schema, table_name, record)
select gen_random_uuid(), 'INSERT', '2026-01-02'::timestamptz + n * interval '1 millisecond',
 'public.wallet_transactions'::regclass, 'public', 'wallet_transactions',
 jsonb_build_object('id', '00000000-0000-4000-8000-000000010803', 'invoice_id', '00000000-0000-4000-8000-000000010804', 'amount', n)
from generate_series(1, 100000) n;
-- Unlinked wallet events may be unrelated to invoices. They must not produce
-- phantom history or force the fallback to scan the directly-linked population.
insert into audit.record_version(record_id, op, ts, table_oid, table_schema, table_name, record)
select gen_random_uuid(), 'INSERT', '2026-01-03'::timestamptz + n * interval '1 millisecond',
 'public.wallet_transactions'::regclass, 'public', 'wallet_transactions',
 jsonb_build_object('id', gen_random_uuid(), 'amount', n, 'description', repeat('Unrelated wallet event ', 20))
from generate_series(1, 10000) n;
analyze audit.record_version;
select performs_ok($$select public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 26)$$, 1000, 'All activity does not rescan 100000 directly linked payments as legacy payments');
select is((select count(distinct e->>'id') from jsonb_array_elements(public.admin_get_finance_invoice_history('00000000-0000-4000-8000-000000010001', '00000000-0000-0000-0000-000000000001', null, false, 0, 26, '', 'payment')) e), 26::bigint, 'Direct and legacy payment pages contain unique events');

select * from finish();
rollback;
