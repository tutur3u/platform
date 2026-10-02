begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(59);

insert into auth.users(id) values
 ('00005743-0000-4000-8000-000000000001'),
 ('00005743-0000-4000-8000-000000000002');
insert into public.users(id) values
 ('00005743-0000-4000-8000-000000000001'),
 ('00005743-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values
 ('00005743-0000-4000-8000-000000000011','Synthetic offline contract',false,
  '00005743-0000-4000-8000-000000000001'),
 ('00005743-0000-4000-8000-000000000012','Synthetic isolated workspace',false,
  '00005743-0000-4000-8000-000000000001');
insert into public.workspace_members(ws_id,user_id,type) values
 ('00005743-0000-4000-8000-000000000011',
  '00005743-0000-4000-8000-000000000001','MEMBER'),
 ('00005743-0000-4000-8000-000000000012',
  '00005743-0000-4000-8000-000000000001','MEMBER') on conflict do nothing;
insert into public.workspace_users(id,ws_id,full_name) values
 ('00005743-0000-4000-8000-000000000021',
  '00005743-0000-4000-8000-000000000011','Synthetic inventory actor');
insert into public.workspace_user_linked_users
 (ws_id,platform_user_id,virtual_user_id) values
 ('00005743-0000-4000-8000-000000000011',
  '00005743-0000-4000-8000-000000000001',
  '00005743-0000-4000-8000-000000000021')
 on conflict (platform_user_id,ws_id) do update
 set virtual_user_id=excluded.virtual_user_id;

create function public.fixture_inventory_create(
 op integer, kind text, payload jsonb
) returns jsonb language sql as $$
 select private.apply_inventory_offline_create(
  '00005743-0000-4000-8000-000000000001',
  '00005743-0000-4000-8000-000000000011',
  ('00005743-0000-4000-8000-' || lpad(op::text,12,'0'))::uuid,
  kind,payload);
$$;
create temporary table contract_results(kind text primary key, response jsonb);
select ok(not has_table_privilege('authenticated','private.inventory_offline_create_receipts','SELECT'), 'authenticated cannot inspect private payload receipts');
select ok(not has_table_privilege('service_role','private.inventory_offline_create_receipts','SELECT'), 'service role cannot read receipts outside the scoped function');
select ok(not has_function_privilege('anon','private.apply_inventory_offline_create(uuid,uuid,uuid,text,jsonb)','EXECUTE'), 'anonymous cannot forge actors');
select ok(not has_function_privilege('authenticated','private.apply_inventory_offline_create(uuid,uuid,uuid,text,jsonb)','EXECUTE'), 'authenticated cannot forge actors');
select ok(has_function_privilege('service_role','private.apply_inventory_offline_create(uuid,uuid,uuid,text,jsonb)','EXECUTE'), 'authorized service can invoke the atomic contract');
insert into contract_results values ('owner',public.fixture_inventory_create(100,'owner','{"name":"Synthetic owner"}'::jsonb));
select ok((select response->'data'->>'id' from contract_results where kind='owner') is not null, 'owner returns an authoritative ID');
select is(public.fixture_inventory_create(100,'owner','{"name":"Synthetic owner"}'::jsonb)->'data'->>'id', (select response->'data'->>'id' from contract_results where kind='owner'), 'owner retry returns the original ID');
select is(public.fixture_inventory_create(100,'owner','{"name":"Synthetic owner"}'::jsonb)->>'replayed', 'true', 'owner retry is identified as a replay');
select is((select count(*) from private.inventory_owners where ws_id='00005743-0000-4000-8000-000000000011' and name='Synthetic owner'), 1::bigint, 'owner retry creates exactly one row');
insert into contract_results values ('manufacturer',public.fixture_inventory_create(101,'manufacturer','{"name":"Synthetic manufacturer"}'::jsonb));
select ok((select response->'data'->>'id' from contract_results where kind='manufacturer') is not null, 'manufacturer returns an authoritative ID');
select is(public.fixture_inventory_create(101,'manufacturer','{"name":"Synthetic manufacturer"}'::jsonb)->'data'->>'id', (select response->'data'->>'id' from contract_results where kind='manufacturer'), 'manufacturer retry returns the original ID');
select is(public.fixture_inventory_create(101,'manufacturer','{"name":"Synthetic manufacturer"}'::jsonb)->>'replayed', 'true', 'manufacturer retry is identified as a replay');
select is((select count(*) from private.inventory_manufacturers where ws_id='00005743-0000-4000-8000-000000000011' and name='Synthetic manufacturer'), 1::bigint, 'manufacturer retry creates exactly one row');
insert into contract_results values ('category',public.fixture_inventory_create(102,'category','{"name":"Synthetic category"}'::jsonb));
select ok((select response->'data'->>'id' from contract_results where kind='category') is not null, 'category returns an authoritative ID');
select is(public.fixture_inventory_create(102,'category','{"name":"Synthetic category"}'::jsonb)->'data'->>'id', (select response->'data'->>'id' from contract_results where kind='category'), 'category retry returns the original ID');
select is(public.fixture_inventory_create(102,'category','{"name":"Synthetic category"}'::jsonb)->>'replayed', 'true', 'category retry is identified as a replay');
select is((select count(*) from public.product_categories where ws_id='00005743-0000-4000-8000-000000000011' and name='Synthetic category'), 1::bigint, 'category retry creates exactly one row');
insert into contract_results values ('unit',public.fixture_inventory_create(103,'unit','{"name":"Synthetic unit"}'::jsonb));
select ok((select response->'data'->>'id' from contract_results where kind='unit') is not null, 'unit returns an authoritative ID');
select is(public.fixture_inventory_create(103,'unit','{"name":"Synthetic unit"}'::jsonb)->'data'->>'id', (select response->'data'->>'id' from contract_results where kind='unit'), 'unit retry returns the original ID');
select is(public.fixture_inventory_create(103,'unit','{"name":"Synthetic unit"}'::jsonb)->>'replayed', 'true', 'unit retry is identified as a replay');
select is((select count(*) from private.inventory_units where ws_id='00005743-0000-4000-8000-000000000011' and name='Synthetic unit'), 1::bigint, 'unit retry creates exactly one row');
insert into contract_results values ('warehouse',public.fixture_inventory_create(104,'warehouse','{"name":"Synthetic warehouse"}'::jsonb));
select ok((select response->'data'->>'id' from contract_results where kind='warehouse') is not null, 'warehouse returns an authoritative ID');
select is(public.fixture_inventory_create(104,'warehouse','{"name":"Synthetic warehouse"}'::jsonb)->'data'->>'id', (select response->'data'->>'id' from contract_results where kind='warehouse'), 'warehouse retry returns the original ID');
select is(public.fixture_inventory_create(104,'warehouse','{"name":"Synthetic warehouse"}'::jsonb)->>'replayed', 'true', 'warehouse retry is identified as a replay');
select is((select count(*) from private.inventory_warehouses where ws_id='00005743-0000-4000-8000-000000000011' and name='Synthetic warehouse'), 1::bigint, 'warehouse retry creates exactly one row');
insert into contract_results values ('finance_category',public.fixture_inventory_create(105,'finance_category','{"name":"Synthetic finance_category","is_expense":false}'::jsonb));
select ok((select response->'data'->>'id' from contract_results where kind='finance_category') is not null, 'finance_category returns an authoritative ID');
select is(public.fixture_inventory_create(105,'finance_category','{"name":"Synthetic finance_category","is_expense":false}'::jsonb)->'data'->>'id', (select response->'data'->>'id' from contract_results where kind='finance_category'), 'finance_category retry returns the original ID');
select is(public.fixture_inventory_create(105,'finance_category','{"name":"Synthetic finance_category","is_expense":false}'::jsonb)->>'replayed', 'true', 'finance_category retry is identified as a replay');
select is((select count(*) from public.transaction_categories where ws_id='00005743-0000-4000-8000-000000000011' and name='Synthetic finance_category'), 1::bigint, 'finance_category retry creates exactly one row');
select throws_ok($$select public.fixture_inventory_create(100,'owner','{"name":"Changed owner"}'::jsonb)$$, '23505', null, 'operation reuse with altered payload fails without effects');
select throws_ok($$select public.fixture_inventory_create(100,'manufacturer','{"name":"Synthetic owner"}'::jsonb)$$, '23505', null, 'operation reuse for another resource fails without effects');
select is((select count(*) from private.inventory_offline_create_receipts), 6::bigint, 'conflicting retries do not add receipts');
select throws_ok($$select public.fixture_inventory_create(110,null,'{"name":"Invalid"}'::jsonb)$$, '22023', null, 'null resource is rejected before effects');
select throws_ok($$select public.fixture_inventory_create(110,'finance_category','{"name":"Invalid"}'::jsonb)$$, '22023', null, 'missing category boolean is rejected');
select throws_ok($$select public.fixture_inventory_create(110,'owner','{"name":"   "}'::jsonb)$$, '22023', null, 'blank names are rejected');
select throws_ok($$select private.apply_inventory_offline_create('00005743-0000-4000-8000-000000000002','00005743-0000-4000-8000-000000000011','00005743-0000-4000-8000-000000000110','owner','{"name":"Nonmember"}')$$, '42501', null, 'captured actor must be a member');
-- Construct only typed foreign keys from the authoritative setup responses.
create function public.fixture_inventory_product_payload() returns jsonb
language sql as $$
 select jsonb_build_object(
  'name','Synthetic product',
  'category_id',(select response->'data'->>'id' from contract_results where kind='category'),
  'owner_id',(select response->'data'->>'id' from contract_results where kind='owner'),
  'manufacturer_id',(select response->'data'->>'id' from contract_results where kind='manufacturer'),
  'finance_category_id',(select response->'data'->>'id' from contract_results where kind='finance_category'),
  'inventory',jsonb_build_array(jsonb_build_object(
   'unit_id',(select response->'data'->>'id' from contract_results where kind='unit'),
   'warehouse_id',(select response->'data'->>'id' from contract_results where kind='warehouse'),
   'amount',5,'min_amount',1,'price',123,
   'revenue_share_partner_id',(select response->'data'->>'id' from contract_results where kind='owner'),
   'revenue_share_bps',1000)));
$$;
insert into contract_results values ('product',
 public.fixture_inventory_create(120,'product',public.fixture_inventory_product_payload()));
select ok((select response->'data'->>'id' from contract_results where kind='product') is not null, 'product returns an authoritative ID');
select is(public.fixture_inventory_create(120,'product',public.fixture_inventory_product_payload())->'data'->>'id', (select response->'data'->>'id' from contract_results where kind='product'), 'lost product response retries to the same product');
select is((select count(*) from public.workspace_products where ws_id='00005743-0000-4000-8000-000000000011'), 1::bigint, 'product retry does not duplicate the catalog row');
select is((select count(*) from private.inventory_products where product_id=(select (response->'data'->>'id')::uuid from contract_results where kind='product')), 1::bigint, 'product retry does not duplicate stock rows');
select is((select sum(amount)::numeric from public.product_stock_changes where product_id=(select (response->'data'->>'id')::uuid from contract_results where kind='product')), 5::numeric, 'product retry records initial stock exactly once');
select is((select amount::numeric from private.inventory_products where product_id=(select (response->'data'->>'id')::uuid from contract_results where kind='product')), 5::numeric, 'initial stock history does not apply the amount twice');
select is((select count(*) from private.inventory_audit_logs where entity_id=(select (response->'data'->>'id')::uuid from contract_results where kind='product')), 1::bigint, 'product retry writes one transactional audit event');
select throws_ok($$select public.fixture_inventory_create(121,'product',jsonb_set(public.fixture_inventory_product_payload(),'{inventory,0,warehouse_id}','"00005743-0000-4000-8000-000000009999"'))$$, '23503', null, 'missing prerequisite rolls back product creation');
select throws_ok($$select public.fixture_inventory_create(122,'product',jsonb_set(public.fixture_inventory_product_payload(),'{inventory}',(public.fixture_inventory_product_payload()->'inventory')||(public.fixture_inventory_product_payload()->'inventory')))$$, '23505', null, 'duplicate stock rows roll back the entire product transaction');
select is((select count(*) from private.inventory_offline_create_receipts where resource='product'), 1::bigint, 'failed product transactions never publish an acknowledgment receipt');
select is((select count(*) from public.workspace_products where ws_id='00005743-0000-4000-8000-000000000011'), 1::bigint, 'failed product transactions leave no partial products');
create function public.fixture_inventory_period_payload() returns jsonb language sql as $$
 select jsonb_build_object('name','Synthetic period','product_scope','allow',
 'product_ids',jsonb_build_array(
 (select response->'data'->>'id' from contract_results where kind='product')));
$$;
insert into contract_results values ('period',public.fixture_inventory_create(
 130,'period',public.fixture_inventory_period_payload()));
select is(public.fixture_inventory_create(130,'period',public.fixture_inventory_period_payload())->'data'->>'id', (select response->'data'->>'id' from contract_results where kind='period'), 'period retry returns its original ID');
select is((select count(*) from private.inventory_sales_period_products where period_id=(select (response->'data'->>'id')::uuid from contract_results where kind='period')), 1::bigint, 'period retry preserves one dependency binding');
select is((select count(*) from private.inventory_audit_logs where entity_id=(select (response->'data'->>'id')::uuid from contract_results where kind='period')), 1::bigint, 'period retry records one audit event');
select throws_ok($$select private.apply_inventory_offline_create('00005743-0000-4000-8000-000000000001','00005743-0000-4000-8000-000000000012','00005743-0000-4000-8000-000000000131','period',public.fixture_inventory_period_payload())$$, '23503', null, 'period cannot reference a product in another workspace');
select throws_ok($$select public.fixture_inventory_create(131,'product',jsonb_set(public.fixture_inventory_product_payload(),'{category_id}','"00005743-0000-4000-8000-000000009999"'))$$, '23503', null, 'product rejects an unconfirmed category ID');
select throws_ok($$select public.fixture_inventory_create(131,'product',jsonb_set(public.fixture_inventory_product_payload(),'{owner_id}','"00005743-0000-4000-8000-000000009999"'))$$, '23503', null, 'product rejects an unconfirmed owner ID');
select throws_ok($$select public.fixture_inventory_create(131,'product',jsonb_set(public.fixture_inventory_product_payload(),'{manufacturer_id}','"00005743-0000-4000-8000-000000009999"'))$$, '23503', null, 'product rejects an unconfirmed manufacturer ID');
select throws_ok($$select public.fixture_inventory_create(131,'product',jsonb_set(public.fixture_inventory_product_payload(),'{finance_category_id}','"00005743-0000-4000-8000-000000009999"'))$$, '23503', null, 'product rejects an unconfirmed Finance category ID');
select throws_ok($$select public.fixture_inventory_create(131,'product',jsonb_set(public.fixture_inventory_product_payload(),'{inventory,0,unit_id}','"00005743-0000-4000-8000-000000009999"'))$$, '23503', null, 'product rejects an unconfirmed unit ID');
select is((select count(*) from private.inventory_offline_create_receipts), 8::bigint, 'only successfully committed creates publish durable receipts');
insert into contract_results values ('isolated_owner',
 private.apply_inventory_offline_create(
 '00005743-0000-4000-8000-000000000001',
 '00005743-0000-4000-8000-000000000012',
 '00005743-0000-4000-8000-000000000100','owner','{"name":"Synthetic owner"}'));
select isnt((select response->'data'->>'id' from contract_results where kind='isolated_owner'),
 (select response->'data'->>'id' from contract_results where kind='owner'),
 'same operation ID in another workspace has independent ownership');
select is((select count(*) from private.inventory_offline_create_receipts),9::bigint,
 'isolated workspace publishes its own scoped receipt');
select * from finish();
rollback;
