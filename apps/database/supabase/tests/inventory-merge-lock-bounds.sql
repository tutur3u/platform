begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(7);
create function public.imlb_id(n integer) returns uuid language sql immutable as $$select ('00009030-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into auth.users(id) values(imlb_id(1));
insert into public.users(id) values(imlb_id(1)) on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values(imlb_id(10),'Synthetic bounded locks',false,imlb_id(1));
insert into private.inventory_owners(id,ws_id,name) values(imlb_id(20),imlb_id(10),'Owner');
insert into public.product_categories(id,ws_id,name) values(imlb_id(40),imlb_id(10),'Category');
select lives_ok($$insert into public.workspace_products(id,ws_id,name,owner_id,category_id)
 select imlb_id(n),imlb_id(10),'Bulk product',imlb_id(20),imlb_id(40) from generate_series(1000,1999)n$$,
 'Thousand-product insert completes without an identity-count rejection');
select lives_ok($$insert into private.inventory_warehouses(id,ws_id,name)
 select imlb_id(n),imlb_id(10),'Bulk warehouse' from generate_series(3000,3999)n$$,
 'Thousand-warehouse insert completes');
select lives_ok($$update public.workspace_products set name='Bulk updated' where ws_id=imlb_id(10)$$,
 'Thousand-product update completes in the same transaction');
select is((select count(*) from public.workspace_products where ws_id=imlb_id(10) and name='Bulk updated'),1000::bigint,
 'Large write is not truncated');
select ok((select count(*) from pg_locks where pid=pg_backend_pid() and locktype='advisory' and granted)<=32,
 'Actual held advisory lock rows are bounded by 32 for one workspace');
select is(private.inventory_identity_lock_key('product',imlb_id(1000)),
 private.inventory_identity_lock_key(imlb_id(10),'product',imlb_id(1000)),
 'Existing helper signature resolves the same authoritative workspace bucket');
select ok(private.inventory_identity_lock_key(imlb_id(10),'product',imlb_id(1000)) is distinct from
 private.inventory_identity_lock_key(imlb_id(11),'product',imlb_id(1000)),
 'Workspace namespace prevents deliberate global-bucket contention');
select * from finish();
rollback;
