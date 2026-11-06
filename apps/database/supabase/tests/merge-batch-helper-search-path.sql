begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(25);

create function pg_temp.helper_signature(fn text) returns regprocedure language sql as $$
  select format('public.%s(uuid,uuid,uuid,text,text,integer)', fn)::regprocedure
$$;
create function pg_temp.helper_names() returns setof text language sql as $$
  values ('merge_workspace_users_batch_update'), ('merge_workspace_users_table_batch')
$$;
grant execute on function pg_temp.helper_signature(text), pg_temp.helper_names()
  to anon, authenticated, service_role;

-- Pinned path and ACL.
select ok((select 'search_path=pg_catalog, pg_temp' = any(p.proconfig) from pg_proc p
  where p.oid = pg_temp.helper_signature(fn)),
  fn || ': proconfig carries search_path=pg_catalog, pg_temp') from pg_temp.helper_names() fn;
select is((select count(*)::integer from pg_proc p, unnest(p.proconfig) c
  where p.oid = pg_temp.helper_signature(fn) and c like 'search_path=%'), 1,
  fn || ': exactly one search_path setting') from pg_temp.helper_names() fn;
select ok((select p.prosecdef from pg_proc p where p.oid = pg_temp.helper_signature(fn)),
  fn || ': stays SECURITY DEFINER') from pg_temp.helper_names() fn;
select ok(not exists (
  select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  where p.oid = pg_temp.helper_signature(fn) and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
), fn || ': PUBLIC has no execute') from pg_temp.helper_names() fn;
select ok(not has_function_privilege('anon', pg_temp.helper_signature(fn), 'EXECUTE')
  and not has_function_privilege('authenticated', pg_temp.helper_signature(fn), 'EXECUTE'),
  fn || ': no client execute') from pg_temp.helper_names() fn;
select ok(has_function_privilege('service_role', pg_temp.helper_signature(fn), 'EXECUTE'),
  fn || ': service_role keeps execute') from pg_temp.helper_names() fn;

-- Minimal fixture: one workspace, a source and a target profile.
create function pg_temp.mbs_id(n integer) returns uuid language sql immutable as $$
  select ('00009130-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
grant execute on function pg_temp.mbs_id(integer) to anon, authenticated, service_role;
insert into auth.users(id) values (pg_temp.mbs_id(1));
insert into public.users(id) values (pg_temp.mbs_id(1)) on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id)
values (pg_temp.mbs_id(2), 'Synthetic helper path', false, pg_temp.mbs_id(1));
insert into public.workspace_users(id, ws_id, full_name) values
  (pg_temp.mbs_id(3), pg_temp.mbs_id(2), 'Source'),
  (pg_temp.mbs_id(4), pg_temp.mbs_id(2), 'Target');
-- public.user_feedbacks.user_id (public schema) and private.workspace_promotions.creator_id (private schema).
insert into public.user_feedbacks(user_id, content) values (pg_temp.mbs_id(3), 'Source feedback');
insert into private.workspace_promotions(id, ws_id, name, code, value, use_ratio, creator_id)
values (pg_temp.mbs_id(5), pg_temp.mbs_id(2), 'Synthetic promo', 'SYNTHETIC-PATH', 1, false, pg_temp.mbs_id(3));
select set_config('request.jwt.claim.sub', pg_temp.mbs_id(1)::text, true);
select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.mbs_id(1), 'role', 'service_role')::text, true);

set local role service_role;
-- batch_update: one allowed public-schema update.
select is((public.merge_workspace_users_batch_update(pg_temp.mbs_id(3), pg_temp.mbs_id(4), pg_temp.mbs_id(2), 'user_feedbacks', 'user_id', 10)->>'rows_updated')::integer,
  1, 'batch_update moves an allowlisted public-schema reference');
-- batch_update: one allowed private-schema update.
select is((public.merge_workspace_users_batch_update(pg_temp.mbs_id(3), pg_temp.mbs_id(4), pg_temp.mbs_id(2), 'workspace_promotions', 'creator_id', 10)->>'success')::boolean,
  true, 'batch_update succeeds for an allowlisted private-schema reference');
reset role;
select is((select count(*)::integer from public.user_feedbacks where user_id = pg_temp.mbs_id(4)), 1,
  'batch_update: public reference now points at the target');
select is((select creator_id from private.workspace_promotions where id = pg_temp.mbs_id(5)), pg_temp.mbs_id(4),
  'batch_update: private reference now points at the target');

-- table_batch: same two schemas, with the references moved back first.
update public.user_feedbacks set user_id = pg_temp.mbs_id(3) where user_id = pg_temp.mbs_id(4);
update private.workspace_promotions set creator_id = pg_temp.mbs_id(3) where id = pg_temp.mbs_id(5);
set local role service_role;
select is((public.merge_workspace_users_table_batch(pg_temp.mbs_id(3), pg_temp.mbs_id(4), pg_temp.mbs_id(2), 'user_feedbacks', 'user_id', 10)->>'rows_updated')::integer,
  1, 'table_batch moves an allowlisted public-schema reference');
select is((public.merge_workspace_users_table_batch(pg_temp.mbs_id(3), pg_temp.mbs_id(4), pg_temp.mbs_id(2), 'workspace_promotions', 'creator_id', 10)->>'rows_updated')::integer,
  1, 'table_batch moves an allowlisted private-schema reference');
reset role;
select is((select creator_id from private.workspace_promotions where id = pg_temp.mbs_id(5)), pg_temp.mbs_id(4),
  'table_batch: private reference now points at the target');

-- A disallowed (table, column) pair is still refused with 22023, as are NULLs.
set local role service_role;
select throws_ok($$select public.merge_workspace_users_batch_update(pg_temp.mbs_id(3), pg_temp.mbs_id(4), pg_temp.mbs_id(2), 'user_feedbacks', 'content', 10)$$,
  '22023', null, 'batch_update rejects a disallowed column');
select throws_ok($$select public.merge_workspace_users_table_batch(pg_temp.mbs_id(3), pg_temp.mbs_id(4), pg_temp.mbs_id(2), 'user_feedbacks', 'content', 10)$$,
  '22023', null, 'table_batch rejects a disallowed column');
select throws_ok($$select public.merge_workspace_users_batch_update(pg_temp.mbs_id(3), pg_temp.mbs_id(4), pg_temp.mbs_id(2), 'workspace_users', 'ws_id', 10)$$,
  '22023', null, 'batch_update rejects a disallowed table');
select throws_ok($$select public.merge_workspace_users_table_batch(pg_temp.mbs_id(3), pg_temp.mbs_id(4), pg_temp.mbs_id(2), null, 'user_id', 10)$$,
  '22023', null, 'table_batch rejects a NULL table');
reset role;

-- Clients are still denied execution.
set local role authenticated;
select throws_ok($$select public.merge_workspace_users_batch_update(null,null,null,'user_feedbacks','user_id',1)$$,
  '42501', null, 'authenticated batch_update call denied');
select throws_ok($$select public.merge_workspace_users_table_batch(null,null,null,'user_feedbacks','user_id',1)$$,
  '42501', null, 'authenticated table_batch call denied');
reset role;
select * from finish();
rollback;
