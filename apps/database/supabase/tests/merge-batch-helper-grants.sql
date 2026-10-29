begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);

select ok(not has_function_privilege('anon', 'public.merge_workspace_users_batch_update(uuid,uuid,uuid,text,text,integer)', 'EXECUTE'), 'anon cannot execute batch_update');
select ok(not has_function_privilege('authenticated', 'public.merge_workspace_users_batch_update(uuid,uuid,uuid,text,text,integer)', 'EXECUTE'), 'authenticated cannot execute batch_update');
select ok(has_function_privilege('service_role', 'public.merge_workspace_users_batch_update(uuid,uuid,uuid,text,text,integer)', 'EXECUTE'), 'service_role can execute batch_update');
select ok(not has_function_privilege('anon', 'public.merge_workspace_users_table_batch(uuid,uuid,uuid,text,text,integer)', 'EXECUTE'), 'anon cannot execute table_batch');
select ok(not has_function_privilege('authenticated', 'public.merge_workspace_users_table_batch(uuid,uuid,uuid,text,text,integer)', 'EXECUTE'), 'authenticated cannot execute table_batch');
select ok(has_function_privilege('service_role', 'public.merge_workspace_users_table_batch(uuid,uuid,uuid,text,text,integer)', 'EXECUTE'), 'service_role can execute table_batch');

set local role anon;
select throws_ok($$select public.merge_workspace_users_batch_update(null,null,null,'workspace_users','id',1)$$, '42501', null, 'anon batch_update call denied');
select throws_ok($$select public.merge_workspace_users_table_batch(null,null,null,'workspace_users','id',1)$$, '42501', null, 'anon table_batch call denied');
reset role;
set local role authenticated;
select throws_ok($$select public.merge_workspace_users_batch_update(null,null,null,'workspace_users','id',1)$$, '42501', null, 'authenticated batch_update call denied');
select throws_ok($$select public.merge_workspace_users_table_batch(null,null,null,'workspace_users','id',1)$$, '42501', null, 'authenticated table_batch call denied');
reset role;

create function public.mbh_id(n integer) returns uuid language sql immutable as $$
  select ('00009127-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
insert into auth.users(id) values (mbh_id(1));
insert into public.users(id) values (mbh_id(1)) on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values (mbh_id(2),'Synthetic helper merge',false,mbh_id(1));
insert into public.workspace_users(id,ws_id,full_name) values (mbh_id(3),mbh_id(2),'Source'),(mbh_id(4),mbh_id(2),'Target');
insert into public.product_categories(id,ws_id,name) values (mbh_id(6),mbh_id(2),'Synthetic category');
insert into private.inventory_owners(id,ws_id,name) values (mbh_id(7),mbh_id(2),'Synthetic owner');
insert into public.workspace_products(id,ws_id,name,creator_id,category_id,owner_id) values (mbh_id(5),mbh_id(2),'Synthetic product',mbh_id(3),mbh_id(6),mbh_id(7));
select set_config('request.jwt.claim.sub', mbh_id(1)::text, true);
select set_config('request.jwt.claims', jsonb_build_object('sub',mbh_id(1),'role','authenticated')::text, true);
select ok(public.has_workspace_permission(mbh_id(2),mbh_id(1),'delete_users'), 'merge actor has delete_users');
select ok(public.has_workspace_permission(mbh_id(2),mbh_id(1),'update_users'), 'merge actor has update_users');

set local role authenticated;
select public.merge_workspace_users_phase1c_batch(mbh_id(3),mbh_id(4),mbh_id(2),10)::text as batch_result \gset
reset role;
select is((:'batch_result'::jsonb->>'success')::boolean, true, 'authorized batch phase calls helper as owner');
select is((select creator_id from public.workspace_products where id=mbh_id(5)), mbh_id(4), 'owner-context helper moves the source reference');

set local role authenticated;
select public.merge_workspace_users(mbh_id(3),mbh_id(4),mbh_id(2))::text as merge_result \gset
reset role;
select is((:'merge_result'::jsonb->>'success')::boolean, true, 'authorized end-to-end public merge succeeds');
select is((select count(*) from public.workspace_users where id=mbh_id(3)), 0::bigint, 'authorized merge deletes the source user');
select * from finish();
rollback;
