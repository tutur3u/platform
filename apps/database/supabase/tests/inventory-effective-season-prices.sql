begin;
-- Bounded retries clear only this fixture's known synthetic workspace.
delete from public.finance_invoice_products where invoice_id in (select id from public.finance_invoices where ws_id='90000000-0000-4000-8000-000000000002');
delete from public.finance_invoices where ws_id='90000000-0000-4000-8000-000000000002';
delete from public.workspaces where id='90000000-0000-4000-8000-000000000002';
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(46);

insert into auth.users(id, email) values
  ('90000000-0000-4000-8000-000000000001', 'season-prices@example.test') on conflict(id) do nothing;
insert into public.users(id, display_name) values
  ('90000000-0000-4000-8000-000000000001', 'Synthetic operator') on conflict(id) do nothing;
insert into public.workspaces(id, name, creator_id, personal) values
  ('90000000-0000-4000-8000-000000000002', 'Synthetic price workspace', '90000000-0000-4000-8000-000000000001', false);
insert into public.workspace_users(id, ws_id, display_name) values
  ('90000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000002', 'Synthetic operator');
insert into public.workspace_configs(ws_id,id,value) values
  ('90000000-0000-4000-8000-000000000002','DEFAULT_CURRENCY','VND');
insert into public.transaction_categories(id, ws_id, name) values
  ('90000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-000000000002', 'Synthetic income');
insert into private.workspace_wallets(id, ws_id, name, currency) values
  ('90000000-0000-4000-8000-000000000005', '90000000-0000-4000-8000-000000000002', 'Synthetic wallet', 'VND');
insert into private.inventory_units(id, ws_id, name) values
  ('90000000-0000-4000-8000-000000000006', '90000000-0000-4000-8000-000000000002', 'Item');
insert into private.inventory_warehouses(id, ws_id, name) values
  ('90000000-0000-4000-8000-000000000007', '90000000-0000-4000-8000-000000000002', 'Synthetic booth');
insert into private.inventory_owners(id,ws_id,name) values
  ('90000000-0000-4000-8000-000000000013','90000000-0000-4000-8000-000000000002','Synthetic owner');
insert into public.product_categories(id,ws_id,name) values
  ('90000000-0000-4000-8000-000000000012','90000000-0000-4000-8000-000000000002','Synthetic merchandise');
insert into public.workspace_products(id, ws_id, name, archived, category_id, owner_id) values
  ('90000000-0000-4000-8000-000000000008', '90000000-0000-4000-8000-000000000002', 'Synthetic keychain', false, '90000000-0000-4000-8000-000000000012','90000000-0000-4000-8000-000000000013');
insert into private.inventory_products(product_id,unit_id,warehouse_id,amount,price) values
  ('90000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-000000000006',
  '90000000-0000-4000-8000-000000000007',10,99000);
insert into private.inventory_sales_periods(id,ws_id,name,pricing_mode,time_zone,starts_at,ends_at,product_scope) values
  ('90000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-000000000002','Synthetic convention',
  'scheduled','Asia/Ho_Chi_Minh',(now() at time zone 'Asia/Ho_Chi_Minh')::date,
  (now() at time zone 'Asia/Ho_Chi_Minh')::date+2,'allowlist');

create function pg_temp.author_price(p_price numeric, p_offset integer) returns jsonb
language sql as $$
  select private.author_inventory_period_price(
    '90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000009',
    '90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000008',
    '90000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000007',
    'VND',p_price,(now() at time zone 'Asia/Ho_Chi_Minh')::date+p_offset,null);
$$;
create function pg_temp.create_period_sale(p_request uuid, p_price numeric default 60000) returns uuid
language sql as $$
  select private.create_inventory_period_invoice(
    '90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000009',p_request,'VND',
    jsonb_build_object('content','Synthetic sale','wallet_id','90000000-0000-4000-8000-000000000005',
      'category_id','90000000-0000-4000-8000-000000000004'),
    jsonb_build_array(jsonb_build_object(
      'product_id','90000000-0000-4000-8000-000000000008','unit_id','90000000-0000-4000-8000-000000000006',
      'warehouse_id','90000000-0000-4000-8000-000000000007','quantity',1,'price',p_price,
      'price_id',(select id from private.inventory_product_prices where period_id='90000000-0000-4000-8000-000000000009'
        order by valid_from limit 1))));
$$;

select ok(to_regclass('private.inventory_product_prices') is not null,'prices are private');
select ok(not has_table_privilege('authenticated','private.inventory_product_prices','INSERT'), 'browser cannot author prices directly');
select ok(not has_function_privilege('authenticated', 'private.create_inventory_period_invoice(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb)', 'EXECUTE'), 'browser cannot call atomic invoice RPC directly');
select lives_ok('select pg_temp.author_price(60000,0)', 'first season price can be authored');
select throws_ok('select pg_temp.author_price(70000,0)','23P01',null,'overlapping same-start price is rejected');
select is((select price from private.inventory_products where product_id='90000000-0000-4000-8000-000000000008'),99000::numeric,'legacy catalog price remains unchanged');
select throws_ok($$select pg_temp.create_period_sale('90000000-0000-4000-8000-000000000010')$$,'23514',
  'Sale does not match the sales period product rules','invalid allowlist rejects sale');
select is((select count(*) from public.finance_invoices where ws_id='90000000-0000-4000-8000-000000000002'),0::bigint,'invalid season creates no invoice');
insert into private.inventory_sales_period_products(ws_id,period_id,product_id) values
  ('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-000000000008');
select throws_ok($$select pg_temp.create_period_sale('90000000-0000-4000-8000-000000000010',99000)$$,'23514',
  'Price changed or expired; refresh and review the cart','legacy price cannot bypass scheduled quote');
select lives_ok($$select pg_temp.create_period_sale('90000000-0000-4000-8000-000000000010')$$,'fresh quote creates an atomic sale');
select is((select price from public.finance_invoice_products where product_id='90000000-0000-4000-8000-000000000008'),60000::numeric,'invoice captures season unit price');
select is((select amount from private.inventory_products where product_id='90000000-0000-4000-8000-000000000008'),9::bigint,'existing invoice stock trigger consumes exactly one item');
select is((select count(*) from private.inventory_sales_period_assignments where period_id='90000000-0000-4000-8000-000000000009'),1::bigint,'period assignment is saved with invoice');
select lives_ok($$select pg_temp.create_period_sale('90000000-0000-4000-8000-000000000010')$$,'same request is idempotent');
select is((select count(*) from public.finance_invoices where ws_id='90000000-0000-4000-8000-000000000002'),1::bigint,'retry creates no duplicate invoice');
select lives_ok('select pg_temp.author_price(70000,1)', 'future adjacent price closes previous interval');
select is((select price from public.finance_invoice_products where product_id='90000000-0000-4000-8000-000000000008'),60000::numeric,'later price leaves historical invoice unchanged');

-- Prove rollback after invoice and line inserts, using local-only fault injection.
create function pg_temp.fail_synthetic_stock() returns trigger language plpgsql as $$
begin raise exception 'Synthetic stock fault' using errcode='23514'; end; $$;
create trigger synthetic_stock_fault before insert on public.product_stock_changes
  for each row execute function pg_temp.fail_synthetic_stock();
select throws_ok($$select pg_temp.create_period_sale('90000000-0000-4000-8000-000000000011')$$,'23514','Synthetic stock fault','stock failure rolls back atomic sale');
select is((select count(*) from public.finance_invoices where ws_id='90000000-0000-4000-8000-000000000002'),1::bigint,'failed stock write leaves no partial invoice');
select is((select amount from private.inventory_products where product_id='90000000-0000-4000-8000-000000000008'),9::bigint,'failed transaction restores consumed stock');

drop trigger synthetic_stock_fault on public.product_stock_changes;
create function pg_temp.edit_stock(p_rows jsonb, p_metadata jsonb default '{}'::jsonb) returns jsonb language sql as $$
 select private.edit_inventory_priced_product('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000008',p_metadata,p_rows,'90000000-0000-4000-8000-000000000003','{}',true);
$$;
create function pg_temp.stock_row(p_amount integer) returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('unit_id','90000000-0000-4000-8000-000000000006','warehouse_id','90000000-0000-4000-8000-000000000007','amount',p_amount,'price',99000,'min_amount',0));
$$;
select lives_ok('select pg_temp.edit_stock(pg_temp.stock_row(9))','unchanged priced tuple edit succeeds');
select lives_ok('select pg_temp.edit_stock(pg_temp.stock_row(8))','priced tuple quantity update succeeds');
select is((select amount from private.inventory_products where product_id='90000000-0000-4000-8000-000000000008'),8::bigint,'quantity edit retains existing tuple');
select lives_ok($$select pg_temp.edit_stock('[]')$$,'priced tuple can be removed without deleting history');
select is((select count(*) from private.inventory_product_prices where product_id='90000000-0000-4000-8000-000000000008'),2::bigint,'removing tuple preserves both price intervals');
select lives_ok('select pg_temp.edit_stock(pg_temp.stock_row(8))','priced tuple can be re-added');
create temp table stock_checkpoint as select count(*) as movements from public.product_stock_changes;
select throws_ok($$select pg_temp.edit_stock('[{"unit_id":"90000000-0000-4000-8000-000000000006","warehouse_id":"90000000-0000-4000-8000-000000000099","amount":2,"price":99000}]','{"name":"Must roll back"}')$$,'23514','Invalid stock workspace relation','invalid replacement rolls back metadata and attempted removal movement');
select is((select name from public.workspace_products where id='90000000-0000-4000-8000-000000000008'),'Synthetic keychain','failed edit restores product metadata');
select is((select count(*) from public.product_stock_changes),(select movements from stock_checkpoint),'failed edit leaves no phantom stock movement');
select is((select price from public.finance_invoice_products where product_id='90000000-0000-4000-8000-000000000008'),60000::numeric,'ordinary inventory edits preserve historical invoice price');
create function pg_temp.invoice_id() returns uuid language sql as $$
 select invoice_id from private.inventory_sale_price_snapshots where request_id='90000000-0000-4000-8000-000000000010';
$$;
select ok(public.admin_delete_finance_invoice('90000000-0000-4000-8000-000000000002',pg_temp.invoice_id(),'90000000-0000-4000-8000-000000000001'),'recoverable deletion succeeds');
select throws_ok($$select pg_temp.create_period_sale('90000000-0000-4000-8000-000000000010')$$,'23514','Sale was deleted; request cannot be replayed','deleted request stays tombstoned');
select is((select count(*) from public.finance_invoices where ws_id='90000000-0000-4000-8000-000000000002'),0::bigint,'retry while deleted creates no invoice');
select is((select amount from private.inventory_products where product_id='90000000-0000-4000-8000-000000000008'),9::bigint,'deleted retry cannot consume stock again');
select is((select lines->0->>'price' from private.inventory_sale_price_snapshots where invoice_id=pg_temp.invoice_id()),'60000','deleted receipt preserves immutable price provenance');
select ok(public.admin_restore_finance_invoice('90000000-0000-4000-8000-000000000002',pg_temp.invoice_id(),'90000000-0000-4000-8000-000000000001'),'normal recovery restores original invoice');
select lives_ok($$select pg_temp.create_period_sale('90000000-0000-4000-8000-000000000010')$$,'restored retry resolves original durable receipt');
select is((select count(*) from public.finance_invoices where ws_id='90000000-0000-4000-8000-000000000002'),1::bigint,'restored retry creates no duplicate invoice');
select is((select amount from private.inventory_products where product_id='90000000-0000-4000-8000-000000000008'),8::bigint,'restored retry does not decrement stock twice');
select is((select price from public.finance_invoice_products where product_id='90000000-0000-4000-8000-000000000008'),60000::numeric,'restore preserves captured historical price');
insert into private.inventory_sales_periods(id,ws_id,name,pricing_mode,product_scope) values
 ('90000000-0000-4000-8000-000000000020','90000000-0000-4000-8000-000000000002','Synthetic legacy','legacy','all');
delete from public.workspace_configs where ws_id='90000000-0000-4000-8000-000000000002' and id='DEFAULT_CURRENCY';
select lives_ok($$select private.create_inventory_period_invoice(
 '90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000020','90000000-0000-4000-8000-000000000021','USD',
 '{"wallet_id":"90000000-0000-4000-8000-000000000005","category_id":"90000000-0000-4000-8000-000000000004","content":"Synthetic legacy"}',
 '[{"product_id":"90000000-0000-4000-8000-000000000008","unit_id":"90000000-0000-4000-8000-000000000006","warehouse_id":"90000000-0000-4000-8000-000000000007","quantity":9,"price":0.001}]')$$,'legacy missing currency setting and finite overselling retain existing policy');
select is((select price from public.finance_invoice_products where invoice_id=(select invoice_id from private.inventory_sale_price_snapshots where request_id='90000000-0000-4000-8000-000000000021')),0.001::numeric,'legacy sub-cent precision remains six major-unit decimals');
select is((select amount from private.inventory_products where product_id='90000000-0000-4000-8000-000000000008'),(-1)::bigint,'legacy overselling preserves prior negative-stock policy');
insert into public.workspace_configs(ws_id,id,value) values('90000000-0000-4000-8000-000000000002','DEFAULT_CURRENCY','VND');
select lives_ok($$select private.update_inventory_scheduled_period('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000009','{"product_scope":"blocklist"}','["90000000-0000-4000-8000-000000000008"]')$$,'period scope and rules update atomically');
select throws_ok($$select private.update_inventory_scheduled_period('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000009','{"product_scope":"all"}','["90000000-0000-4000-8000-000000000099"]')$$,'23514','Invalid period product workspace','invalid rule update cannot expose an empty blocklist');
select is((select product_scope from private.inventory_sales_periods where id='90000000-0000-4000-8000-000000000009'),'blocklist','failed rule edit preserves original scope');


select * from finish();
rollback;
