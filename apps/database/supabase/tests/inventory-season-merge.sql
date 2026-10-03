begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function public.ism_id(n integer) returns uuid language sql immutable as $$select ('00009200-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into auth.users(id) values(ism_id(1)),(ism_id(2));
insert into public.users(id) values(ism_id(1)),(ism_id(2)) on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values(ism_id(10),'Season merge',false,ism_id(1)),(ism_id(11),'Other season workspace',false,ism_id(1));
insert into public.workspace_members(ws_id,user_id,type) values(ism_id(10),ism_id(1),'MEMBER') on conflict do nothing;
insert into private.inventory_owners(id,ws_id,name) values(ism_id(20),ism_id(10),'Owner');
insert into public.product_categories(id,ws_id,name) values(ism_id(21),ism_id(10),'Category');
insert into private.inventory_units(id,ws_id,name) values(ism_id(22),ism_id(10),'Each');
insert into private.inventory_warehouses(id,ws_id,name) values(ism_id(23),ism_id(10),'Warehouse');
insert into public.workspace_products(id,ws_id,name,owner_id,category_id) values(ism_id(24),ism_id(10),'Product',ism_id(20),ism_id(21)),(ism_id(25),ism_id(10),'Other product',ism_id(20),ism_id(21));
insert into private.inventory_products(product_id,unit_id,warehouse_id,amount,price) values(ism_id(24),ism_id(22),ism_id(23),123,10);
insert into private.inventory_sales_periods(id,ws_id,name,description,pricing_mode,time_zone,starts_at,ends_at) values
 (ism_id(30),ism_id(10),'Source','Source description','scheduled','UTC',current_date,current_date+20),
 (ism_id(31),ism_id(10),'Destination','Target description','scheduled','UTC',current_date,current_date+20),
 (ism_id(32),ism_id(10),'Calendar mismatch',null,'scheduled','Asia/Ho_Chi_Minh',current_date,current_date+20),
 (ism_id(33),ism_id(10),'Legacy source',null,'legacy',null,null,null),
 (ism_id(34),ism_id(10),'Legacy destination',null,'legacy',null,null,null),
 (ism_id(35),ism_id(11),'Other workspace',null,'legacy',null,null,null);
insert into private.inventory_sales_period_assignments(ws_id,period_id,sale_source,sale_id,assigned_by) values(ism_id(10),ism_id(30),'finance_invoice',ism_id(50),ism_id(1));
insert into private.inventory_sale_price_snapshots(invoice_id,ws_id,request_id,actor_id,period_id,period_name,currency,captured_at,lines,request_payload)
 values(ism_id(50),ism_id(10),ism_id(51),ism_id(1),ism_id(30),'Captured original season','USD',now(),'[{"price":7,"quantity":2,"original":true}]','{"receipt":"original"}');
insert into private.inventory_product_prices(id,ws_id,period_id,product_id,unit_id,warehouse_id,currency,price,valid_from,valid_to) values
 (ism_id(40),ism_id(10),ism_id(30),ism_id(24),ism_id(22),ism_id(23),'USD',10,now()+interval '1 day',now()+interval '4 days'),
 (ism_id(41),ism_id(10),ism_id(31),ism_id(24),ism_id(22),ism_id(23),'USD',20,now()+interval '2 days',now()+interval '3 days'),
 (ism_id(42),ism_id(10),ism_id(30),ism_id(24),ism_id(22),ism_id(23),'USD',7,now()-interval '4 days',now()-interval '1 day');
-- A real recoverable historical invoice, with a durable season quote tombstone.
insert into private.workspace_wallets(id,ws_id,name) values(ism_id(70),ism_id(10),'Historical wallet');
insert into public.transaction_categories(id,ws_id,name,is_expense) values(ism_id(71),ism_id(10),'Income',false);
insert into public.finance_invoices(id,ws_id,wallet_id,category_id,price,note) values(ism_id(50),ism_id(10),ism_id(70),ism_id(71),14,'Historical season invoice');
insert into public.finance_invoice_products(invoice_id,product_id,warehouse_id,unit_id,amount,price) values(ism_id(50),ism_id(24),ism_id(23),ism_id(22),2,7);
create temporary table original_invoice_line as select to_jsonb(p) data from public.finance_invoice_products p where invoice_id=ism_id(50);
create temporary table original_invoice_payment as select to_jsonb(t) data from public.wallet_transactions t where invoice_id=ism_id(50);
select ok(public.admin_delete_finance_invoice(ism_id(10),ism_id(50),ism_id(1)),'Actual trusted deletion retains durable season quote');
-- Real legacy period-invoice request: deletion/recovery and offline replay after merge.
insert into public.workspace_users(id,ws_id,full_name) values(ism_id(72),ism_id(10),'Season actor');
create function public.ism_sale() returns uuid language sql as $$
 select private.create_inventory_period_invoice(ism_id(10),ism_id(1),ism_id(72),ism_id(33),ism_id(81),'USD',
 jsonb_build_object('wallet_id',ism_id(70),'category_id',ism_id(71),'content','Offline historical invoice'),
 jsonb_build_array(jsonb_build_object('product_id',ism_id(24),'unit_id',ism_id(22),'warehouse_id',ism_id(23),'quantity',2,'price',7)))
$$;
create temporary table offline_invoice as select public.ism_sale() id;
create temporary table offline_quote as select to_jsonb(q) data from private.inventory_sale_price_snapshots q where invoice_id=(select id from offline_invoice);
select ok(public.admin_delete_finance_invoice(ism_id(10),(select id from offline_invoice),ism_id(1)),'Real offline invoice deletion retains original request receipt');
select lives_ok($$select private.apply_inventory_season_merge(ism_id(10),ism_id(33),ism_id(34),private.preview_inventory_season_merge(ism_id(10),ism_id(33),ism_id(34),ism_id(1))->>'version','target','target','block',ism_id(1))$$,'Unpriced legacy source merges without rewriting historical request');
select throws_ok($$select public.ism_sale()$$,'23514','Sale was deleted; request cannot be replayed','Deleted offline request remains tombstoned after season merge');
-- Dedicated long planning list, independent of the history/import assertions.
insert into private.inventory_sales_periods(id,ws_id,name,pricing_mode,time_zone,starts_at,ends_at) values
 (ism_id(36),ism_id(10),'Long source','scheduled','UTC',current_date,current_date+20),(ism_id(37),ism_id(10),'Long target','scheduled','UTC',current_date,current_date+20);
insert into private.inventory_product_prices(id,ws_id,period_id,product_id,unit_id,warehouse_id,currency,price,valid_from,valid_to)
 select ism_id(200+n),ism_id(10),ism_id(36),ism_id(24),ism_id(22),ism_id(23),'USD',n,now()+interval '7 days'+n*interval '1 hour',now()+interval '7 days'+(n+1)*interval '1 hour' from generate_series(1,52) n;
insert into public.workspace_products(id,ws_id,name,owner_id,category_id)
 select ism_id(300+n),ism_id(10),'Rule product '||n,ism_id(20),ism_id(21) from generate_series(1,52) n;
update private.inventory_sales_periods set product_scope='allowlist' where id=ism_id(37);
insert into private.inventory_sales_period_products(ws_id,period_id,product_id)
 select ism_id(10),ism_id(37),ism_id(300+n) from generate_series(1,52) n;
create temporary table old_destination_rules as select r.product_id,r.created_at,p.name from private.inventory_sales_period_products r
 join public.workspace_products p on p.id=r.product_id where r.period_id=ism_id(37);
create temporary table long_review as select private.preview_inventory_season_merge(ism_id(10),ism_id(36),ism_id(37),ism_id(1)) data;
select is((select (data->>'futurePriceCount')::integer from long_review),52,'Long preview retains total count beyond one page');
select is((select jsonb_array_length(data->'futurePrices') from long_review),50,'First planning page bounded to fifty labels');
select ok((select (data->>'hasMore')::boolean from long_review),'Long preview visibly requires another page');
select is(jsonb_array_length(private.preview_inventory_season_merge(ism_id(10),ism_id(36),ism_id(37),ism_id(1),(select (data->>'version')::uuid from long_review),2)->'futurePrices'),2,'Second planning page includes all remaining rows with same token');
select is((select jsonb_array_length(data->'targetRules') from long_review),50,'Rule review is also paginated at fifty named rows');
select is((select (data->>'targetRuleConflictCount')::integer from long_review),52,'Preview exposes chosen-rule exclusions before confirmation');
select lives_ok($$select private.apply_inventory_season_merge(ism_id(10),ism_id(36),ism_id(37),(select data->>'version' from long_review),'target','source','block',ism_id(1))$$,'Explicit source rules replace long destination rule set');
select is((select count(*) from private.inventory_season_merge_rules m join old_destination_rules r on r.product_id=m.original_product_id
 where m.merge_source_id=ism_id(36) and m.original_created_at=r.created_at and m.original_product_name=r.name),52::bigint,'All original destination rule identities/timestamps/names retained relationally, beyond preview page');
select is((select count(*) from private.inventory_sales_period_products where period_id=ism_id(37)),0::bigint,'Destination uses selected complete source eligibility rule set');
create temporary table original_prices as select * from private.inventory_product_prices where id in(ism_id(40),ism_id(41),ism_id(42));
create temporary table original_quotes as select * from private.inventory_sale_price_snapshots where invoice_id=ism_id(50);
select ok(private.inventory_season_merge_schema_ready(),'Readiness verifies parent and five writer guards');
select ok(not has_function_privilege('authenticated','private.apply_inventory_season_merge(uuid,uuid,uuid,text,text,text,text,uuid)','execute'),'Authenticated cannot bypass API via merge RPC');
select throws_ok($$select private.preview_inventory_season_merge(ism_id(10),ism_id(30),ism_id(31),ism_id(2))$$,'42501',null,'Preview derives trusted actor membership');
select throws_ok($$select private.preview_inventory_season_merge(ism_id(10),ism_id(30),ism_id(35),ism_id(1))$$,'23503',null,'Cross-workspace target rejected');
create temporary table review as select private.preview_inventory_season_merge(ism_id(10),ism_id(30),ism_id(31),ism_id(1)) data;
select is((select (data->>'futurePriceCount')::integer from review),1,'Historical price payloads excluded from mutable plan');
select is((select (data->>'conflictCount')::integer from review),1,'Overlapping future intervals explicitly reviewed');
select is((select data->'futurePrices'->0->>'productName' from review),'Product','Price identity includes product name');
select is((select data->'futurePrices'->0->>'unitName' from review),'Each','Price identity includes unit name');
select is((select data->'futurePrices'->0->>'warehouseName' from review),'Warehouse','Price identity includes warehouse name');
select ok((select data->>'expiresAt' is not null from review),'Preview has explicit freshness deadline');
select is(private.preview_inventory_season_merge(ism_id(10),ism_id(30),ism_id(31),ism_id(1),(select (data->>'version')::uuid from review))->>'version',(select data->>'version' from review),'Frozen cutoff token remains stable across page reads');
select throws_ok($$select private.preview_inventory_season_merge(ism_id(10),ism_id(30),ism_id(31),ism_id(2),(select (data->>'version')::uuid from review))$$,'42501',null,'Another actor cannot read existing token');
insert into public.workspace_members(ws_id,user_id,type) values(ism_id(10),ism_id(2),'MEMBER') on conflict do nothing;
select throws_ok($$select private.preview_inventory_season_merge(ism_id(10),ism_id(30),ism_id(31),ism_id(2),(select (data->>'version')::uuid from review))$$,'40001',null,'Even another workspace member cannot consume the actor-bound token');
select throws_ok($$select private.apply_inventory_season_merge(ism_id(10),ism_id(30),ism_id(31),(select data->>'version' from review),null,'target','target',ism_id(1))$$,'22023',null,'NULL policy rejected');
select throws_ok($$select private.apply_inventory_season_merge(ism_id(10),ism_id(30),ism_id(31),(select data->>'version' from review),'target','target','block',ism_id(1))$$,'23514',null,'Explicit block policy refuses overlap without side effects');
select is(private.preview_inventory_season_merge(ism_id(10),ism_id(30),ism_id(32),ism_id(1))->'blockers','["pricing_calendar_mismatch"]'::jsonb,'Priced timezone mismatch blocks without reinterpretation');
update private.inventory_sales_period_assignments set assigned_at=assigned_at+interval '1 second' where period_id=ism_id(30);
select throws_ok($$select private.apply_inventory_season_merge(ism_id(10),ism_id(30),ism_id(31),(select data->>'version' from review),'target','target','target',ism_id(1))$$,'40001',null,'Changed assignment invalidates planning version');
update review set data=private.preview_inventory_season_merge(ism_id(10),ism_id(30),ism_id(31),ism_id(1));
update private.inventory_season_merge_previews set expires_at=clock_timestamp()-interval '1 second' where id=(select (data->>'version')::uuid from review);
select throws_ok($$select private.apply_inventory_season_merge(ism_id(10),ism_id(30),ism_id(31),(select data->>'version' from review),'target','target','target',ism_id(1))$$,'40001',null,'Expired server token fails closed');
update review set data=private.preview_inventory_season_merge(ism_id(10),ism_id(30),ism_id(31),ism_id(1));
select lives_ok($$select private.apply_inventory_season_merge(ism_id(10),ism_id(30),ism_id(31),(select data->>'version' from review),'source','source','target',ism_id(1))$$,'Explicit target overlap policy imports uncovered intervals');
select is((select imported_price_count from private.inventory_season_merges where source_id=ism_id(30)),2,'Source interval split around target interval creates two fresh quotes');
select is((select count(*) from original_prices o join private.inventory_product_prices p on p.id=o.id where to_jsonb(o)=to_jsonb(p)),3::bigint,'Every original price ID interval and value remains byte-identical');
select is((select to_jsonb(q) from private.inventory_sale_price_snapshots q where invoice_id=ism_id(50)),(select to_jsonb(q) from original_quotes q),'Captured invoice quote identity/name/lines unchanged');
select is((select amount from private.inventory_products where product_id=ism_id(24)),123::bigint,'Merge never changes stock');
select is((select period_id from private.inventory_sales_period_assignments where sale_id=ism_id(50)),ism_id(31),'Reporting classification follows destination');
select is((select original_period_id from private.inventory_season_merge_assignments where sale_id=ism_id(50)),ism_id(30),'Original reporting classification durably retained');
select is((select merged_into_id from private.inventory_sales_periods where id=ism_id(30)),ism_id(31),'Source is durable alias');
select is((select name from private.inventory_sales_periods where id=ism_id(30)),'Source','Source historical name unchanged');
select is((select name from private.inventory_sales_periods where id=ism_id(31)),'Destination','Destination identity/date configuration retained');
select is((select description from private.inventory_sales_periods where id=ism_id(31)),'Source description','Explicit description choice applied');
select lives_ok($$select private.apply_inventory_season_merge(ism_id(10),ism_id(30),ism_id(31),(select data->>'version' from review),'source','source','target',ism_id(1))$$,'Same receipt is idempotent');
select throws_ok($$select private.apply_inventory_season_merge(ism_id(10),ism_id(30),ism_id(31),(select data->>'version' from review),'source','source','target',ism_id(2))$$,'23514',null,'Another member cannot reuse an actor-bound committed receipt');
select is((select count(*) from private.inventory_season_merge_prices where merge_source_id=ism_id(30)),2::bigint,'Retry cannot duplicate schedules');
select throws_ok($$update private.inventory_sales_periods set status='active' where id=ism_id(30)$$,'23514',null,'Stale source restore rejected');
select throws_ok($$insert into private.inventory_sales_period_assignments(ws_id,period_id,sale_source,sale_id) values(ism_id(10),ism_id(30),'finance_invoice',ism_id(52))$$,'23514',null,'New source assignments reject merged alias');
select throws_ok($$insert into private.inventory_product_prices(ws_id,period_id,product_id,unit_id,warehouse_id,currency,price,valid_from,valid_to) values(ism_id(10),ism_id(30),ism_id(24),ism_id(22),ism_id(23),'USD',99,now()+interval '5 days',now()+interval '6 days')$$,'23514',null,'New source price writes reject merged alias');
select throws_ok($$update private.inventory_sale_price_snapshots set period_name='Changed' where invoice_id=ism_id(50)$$,'23514',null,'Captured quote provenance remains immutable');
select lives_ok($$update private.inventory_sales_periods set description='Other live edit' where id=ism_id(34)$$,'Unrelated period CRUD remains available');
alter table private.inventory_sales_period_assignments disable trigger inventory_a_season_merge_guard;
select ok(not private.inventory_season_merge_schema_ready(),'Readiness rejects a missing writer guard');
alter table private.inventory_sales_period_assignments enable trigger inventory_a_season_merge_guard;
-- Force deferred constraints at a transaction boundary, not only statement checks.
select throws_ok($$delete from private.inventory_product_prices where id=(select imported_price_id from private.inventory_season_merge_prices limit 1); set constraints all immediate$$,'23503',null,'Standalone imported quote removal cannot commit');
-- Isolate the FK from the stricter alias guard for the original planning price.
alter table private.inventory_product_prices disable trigger inventory_a_season_merge_guard;
select throws_ok($$delete from private.inventory_product_prices where id=ism_id(40); set constraints all immediate$$,'23503',null,'Standalone referenced original quote removal cannot commit even without alias guard');
alter table private.inventory_product_prices enable trigger inventory_a_season_merge_guard;
select throws_ok($$delete from private.inventory_sales_periods where id=ism_id(31); set constraints all immediate$$,'23503',null,'Standalone referenced destination period removal cannot commit');
select ok(public.admin_restore_finance_invoice(ism_id(10),ism_id(50),ism_id(1)),'Trusted historical restore succeeds after season merge without editing quote');
select is((select to_jsonb(p) from public.finance_invoice_products p where invoice_id=ism_id(50)),(select data from original_invoice_line),'Restored captured line and price are identical');
select is((select to_jsonb(t) from public.wallet_transactions t where invoice_id=ism_id(50)),(select data from original_invoice_payment),'Restored payment identity unchanged');
select is((select to_jsonb(q) from private.inventory_sale_price_snapshots q where invoice_id=ism_id(50)),(select to_jsonb(q) from original_quotes q),'Restoration retains original durable quote unchanged');
select throws_ok($$delete from private.inventory_sale_price_snapshots where invoice_id=ism_id(50)$$,'23514',null,'Direct quote delete stays forbidden');
select ok(public.admin_restore_finance_invoice(ism_id(10),(select id from offline_invoice),ism_id(1)),'Actual trusted restore succeeds for merged historical season offline invoice');
create temporary table stock_before_offline_replay as select amount from private.inventory_products where product_id=ism_id(24);
select is(public.ism_sale(),(select id from offline_invoice),'Restored offline request resolves original invoice despite source alias');
select is((select amount from private.inventory_products where product_id=ism_id(24)),(select amount from stock_before_offline_replay),'Restored offline replay does not consume stock again');
select is((select to_jsonb(q) from private.inventory_sale_price_snapshots q where invoice_id=(select id from offline_invoice)),(select data from offline_quote),'Merged season restore/replay preserves original quote payload');
select ok(public.admin_delete_finance_invoice(ism_id(10),(select id from offline_invoice),ism_id(1)),'Trusted offline re-deletion retains quote tombstone for cascade');
select ok(public.admin_delete_finance_invoice(ism_id(10),ism_id(50),ism_id(1)),'Trusted final deletion retains quote tombstone for workspace cascade');
select lives_ok($$delete from public.workspaces where id=ism_id(10)$$,'Workspace cascade remains compatible with durable receipt foreign keys and quote guards');
select is((select count(*) from private.inventory_season_merge_prices),0::bigint,'Workspace cascade removes only owned provenance');
select * from finish();
rollback;
