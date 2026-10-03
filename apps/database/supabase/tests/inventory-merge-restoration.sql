begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(24);
create function public.imr_id(n integer) returns uuid language sql immutable as $$select ('00009010-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into auth.users(id) values(imr_id(1));
insert into public.users(id) values(imr_id(1)) on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values(imr_id(10),'Synthetic merge',false,imr_id(1)),(imr_id(11),'Other workspace',false,imr_id(1));
insert into public.workspace_members(ws_id,user_id,type) values(imr_id(10),imr_id(1),'MEMBER') on conflict do nothing;
insert into public.workspace_users(id,ws_id,full_name) values(imr_id(90),imr_id(10),'Synthetic merge actor');
insert into private.inventory_owners(id,ws_id,name) values(imr_id(20),imr_id(10),'Owner');
insert into private.inventory_units(id,ws_id,name) values(imr_id(21),imr_id(10),'Each'),(imr_id(22),imr_id(10),'Box');
insert into private.inventory_warehouses(id,ws_id,name) values(imr_id(30),imr_id(10),'Source warehouse'),(imr_id(31),imr_id(10),'Target warehouse'),(imr_id(32),imr_id(11),'Other');
insert into public.product_categories(id,ws_id,name) values(imr_id(40),imr_id(10),'Category');
insert into public.workspace_products(id,ws_id,name,owner_id,category_id) values
 (imr_id(50),imr_id(10),'Source product',imr_id(20),imr_id(40)),(imr_id(51),imr_id(10),'Target product',imr_id(20),imr_id(40)),
 (imr_id(52),imr_id(10),'Third product',imr_id(20),imr_id(40));
insert into private.inventory_products(product_id,warehouse_id,unit_id,amount,price,min_amount) values
 (imr_id(50),imr_id(30),imr_id(21),3,100,1),(imr_id(51),imr_id(30),imr_id(21),7,200,2),
 (imr_id(50),imr_id(30),imr_id(22),2,500,0);
insert into public.product_stock_changes(id,product_id,warehouse_id,unit_id,amount,creator_id) values(imr_id(60),imr_id(50),imr_id(30),imr_id(21),3,imr_id(90));

insert into private.workspace_wallets(id,ws_id,name) values(imr_id(100),imr_id(10),'Recovery wallet');
insert into public.transaction_categories(id,ws_id,name,is_expense) values(imr_id(101),imr_id(10),'Income',false);
insert into public.finance_invoices(id,ws_id,wallet_id,category_id,customer_id,price,note)
 values(imr_id(102),imr_id(10),imr_id(100),imr_id(101),imr_id(90),100,'Historical sale');
insert into public.finance_invoice_products(invoice_id,product_id,warehouse_id,unit_id,amount,price)
 values(imr_id(102),imr_id(50),imr_id(30),imr_id(21),1,100);
create temporary table original_line as select to_jsonb(p) data from public.finance_invoice_products p where invoice_id=imr_id(102);
create temporary table original_payment as select to_jsonb(t) data from public.wallet_transactions t where invoice_id=imr_id(102);
select ok(public.admin_delete_finance_invoice(imr_id(10),imr_id(102),imr_id(1)),'Actual invoice delete snapshots original sale');
select lives_ok($$select private.apply_inventory_merge(imr_id(10),'product',imr_id(50),imr_id(51),private.preview_inventory_merge(imr_id(10),'product',imr_id(50),imr_id(51))->>'version','target','target',imr_id(1))$$,'Product merges after invoice deletion');
select lives_ok($$select private.apply_inventory_merge(imr_id(10),'warehouse',imr_id(30),imr_id(31),private.preview_inventory_merge(imr_id(10),'warehouse',imr_id(30),imr_id(31))->>'version','target','target',imr_id(1))$$,'Warehouse merges after invoice deletion');
create temporary table stock_before_restore as select jsonb_agg(to_jsonb(p) order by product_id,warehouse_id,unit_id) data from private.inventory_products p where product_id=imr_id(51);
select throws_ok($$select public.admin_restore_finance_invoice(imr_id(10),imr_id(102),imr_id(999))$$,'42501',null,'Unauthorized actor cannot restore merged references');
select ok(public.admin_restore_finance_invoice(imr_id(10),imr_id(102),imr_id(1)),'Actual restore RPC succeeds after both merges');
select is((select to_jsonb(p) from public.finance_invoice_products p where invoice_id=imr_id(102)),(select data from original_line),'Original line and IDs restored exactly');
select is((select to_jsonb(t) from public.wallet_transactions t where invoice_id=imr_id(102)),(select data from original_payment),'Original payment restored exactly');
select is((select jsonb_agg(to_jsonb(p) order by product_id,warehouse_id,unit_id) from private.inventory_products p where product_id=imr_id(51)),(select data from stock_before_restore),'Restore does not consume merged stock again');
select ok(not public.admin_restore_finance_invoice(imr_id(10),imr_id(102),imr_id(1)),'Restoration replay is idempotent');
select is((select count(*) from private.inventory_invoice_restore_context),0::bigint,'Trusted restore capability removed on success');
select set_config('finance.restoring_invoice',imr_id(102)::text,true);
select throws_ok($$insert into public.finance_invoice_products select * from jsonb_populate_record(null::public.finance_invoice_products,(select data from original_line))$$,'23514',null,'Forged GUC cannot insert original alias line after restoration');
insert into public.finance_invoices(id,ws_id,wallet_id,category_id,customer_id,price)
 values(imr_id(103),imr_id(10),imr_id(100),imr_id(101),imr_id(90),100);
select throws_ok($$insert into public.finance_invoice_products(invoice_id,product_id,warehouse_id,unit_id,amount,price) values(imr_id(103),imr_id(50),imr_id(31),imr_id(21),1,100)$$,'23514',null,'New sale cannot use merged product even with forged restoration flag');
select throws_ok($$insert into public.finance_invoice_products(invoice_id,product_id,warehouse_id,unit_id,amount,price) values(imr_id(103),imr_id(51),imr_id(30),imr_id(21),1,100)$$,'23514',null,'New sale cannot use merged warehouse');
select throws_ok($$insert into private.inventory_products(product_id,warehouse_id,unit_id,amount) values(imr_id(50),imr_id(31),imr_id(21),1)$$,'23514',null,'Stale stock insertion remains forbidden');
select ok(not has_table_privilege('service_role','private.inventory_invoice_restore_context','INSERT'),'Service role cannot manufacture restore capability');
select ok(not has_table_privilege('authenticated','private.inventory_invoice_restore_context','INSERT'),'Authenticated callers cannot manufacture restore capability');
select ok(public.admin_delete_finance_invoice(imr_id(10),imr_id(102),imr_id(1)),'Restored invoice can be deleted again');
select throws_ok($$insert into public.finance_invoice_products select * from jsonb_populate_record(null::public.finance_invoice_products,(select data from original_line))$$,'23514',null,'Pending recovery plus forged GUC still cannot authorize line insertion');
-- Simulate a no-longer-available unit inside the recovery snapshot; restoration
-- must roll back after its trusted capability has been allocated.
update private.finance_invoice_recovery set snapshot=jsonb_set(snapshot,'{products,0,unit_id}',to_jsonb(imr_id(999)::text)) where invoice_id=imr_id(102);
select throws_ok($$select public.admin_restore_finance_invoice(imr_id(10),imr_id(102),imr_id(1))$$,'23503',null,'Unavailable historical reference rolls back restoration');
select is((select count(*) from private.inventory_invoice_restore_context),0::bigint,'Failed restoration leaves no trusted capability');
select is((select count(*) from public.finance_invoices where id=imr_id(102)),0::bigint,'Failed restoration leaves no partial invoice');
select is((select jsonb_agg(to_jsonb(p) order by product_id,warehouse_id,unit_id) from private.inventory_products p where product_id=imr_id(51)),(select data from stock_before_restore),'Failed restoration preserves merged stock');
update private.finance_invoice_recovery set snapshot=jsonb_set(snapshot,'{products}',jsonb_build_array((select data from original_line))) where invoice_id=imr_id(102);
select ok(public.admin_restore_finance_invoice(imr_id(10),imr_id(102),imr_id(1)),'A second authorized historical restoration succeeds');
select is((select count(*) from public.finance_invoice_products where invoice_id=imr_id(102)),1::bigint,'Repeated delete/restore retains one original line');
select * from finish();
rollback;
