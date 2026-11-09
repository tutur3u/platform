-- Workspace document parent/position. Synthetic fixtures only.
-- A root is depth 1. The trigger allows 16 and rejects 17, a cycle, a
-- self-parent, and a cross-workspace parent. Delete sets children to root.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.doc(n integer) returns uuid language sql as $$
  select ('a1900000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values (
  pg_temp.doc(1),
  'wdh-member@example.com',
  now(),
  '{}'::jsonb,
  '{}'::jsonb
);
insert into public.users (id) values (pg_temp.doc(1)) on conflict (id) do nothing;
insert into public.workspaces (id, name, personal, creator_id) values
  (pg_temp.doc(10), 'WDH A', false, pg_temp.doc(1)),
  (pg_temp.doc(11), 'WDH B', false, pg_temp.doc(1));
insert into public.workspace_members (ws_id, user_id, type)
values (pg_temp.doc(10), pg_temp.doc(1), 'MEMBER')
on conflict (ws_id, user_id) do nothing;

select is(
  (select confdeltype::text from pg_constraint
    where conrelid = 'public.workspace_documents'::regclass
      and conname = 'workspace_documents_parent_id_fkey'),
  'n',
  'deleting a parent sets children to root');
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'workspace_documents_parent_id_idx'
  ),
  'parent lookup index exists');
select ok(
  not has_function_privilege(
    'authenticated',
    'public.enforce_workspace_document_hierarchy()',
    'execute'
  ),
  'authenticated cannot call the trigger function');
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_documents'
      and policyname ilike '%hierarch%'
  ),
  'hierarchy adds no RLS policy');

insert into public.workspace_documents (id, ws_id, name, position)
values (pg_temp.doc(20), pg_temp.doc(10), 'Root', 10);
insert into public.workspace_documents (id, ws_id, name, parent_id, position)
values (pg_temp.doc(21), pg_temp.doc(10), 'Child', pg_temp.doc(20), 20);
select is(
  (select parent_id from public.workspace_documents where id = pg_temp.doc(21)),
  pg_temp.doc(20),
  'a child stores its parent');

select throws_ok(
  format(
    'insert into public.workspace_documents (id, ws_id, name, parent_id) values (%L, %L, %L, %L)',
    pg_temp.doc(22), pg_temp.doc(10), 'Self', pg_temp.doc(22)
  ),
  '23514',
  null,
  'a document cannot parent itself');

insert into public.workspace_documents (id, ws_id, name)
values (pg_temp.doc(23), pg_temp.doc(11), 'Other workspace');
select throws_ok(
  format(
    'update public.workspace_documents set parent_id = %L where id = %L',
    pg_temp.doc(23), pg_temp.doc(21)
  ),
  '42501',
  null,
  'a parent in another workspace is rejected');

insert into public.workspace_documents (id, ws_id, name)
values (pg_temp.doc(24), null, 'Unscoped');
select throws_ok(
  format(
    'update public.workspace_documents set parent_id = %L where id = %L',
    pg_temp.doc(24), pg_temp.doc(20)
  ),
  '42501',
  null,
  'a workspace document cannot parent an unscoped document');
insert into public.workspace_documents (id, ws_id, name, parent_id)
values (pg_temp.doc(25), null, 'Unscoped child', pg_temp.doc(24));
select is(
  (select parent_id from public.workspace_documents where id = pg_temp.doc(25)),
  pg_temp.doc(24),
  'two unscoped documents can nest');

insert into public.workspace_documents (id, ws_id, name) values
  (pg_temp.doc(30), pg_temp.doc(10), 'Cycle root');
insert into public.workspace_documents (id, ws_id, name, parent_id) values
  (pg_temp.doc(31), pg_temp.doc(10), 'Cycle mid', pg_temp.doc(30)),
  (pg_temp.doc(32), pg_temp.doc(10), 'Cycle leaf', pg_temp.doc(31));
select throws_ok(
  format(
    'update public.workspace_documents set parent_id = %L where id = %L',
    pg_temp.doc(32), pg_temp.doc(30)
  ),
  '23514',
  null,
  'parenting a descendant is a cycle');

do $$
declare
  i integer;
  prev uuid := null;
  doc uuid;
begin
  for i in 1..16 loop
    doc := ('a1910000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into public.workspace_documents (id, ws_id, name, parent_id)
    values (doc, pg_temp.doc(10), 'Depth ' || i, prev);
    prev := doc;
  end loop;
end $$;

select is(
  (with recursive chain as (
     select id, 1 as depth
     from public.workspace_documents
     where id = 'a1910000-0000-4000-8000-000000000001'::uuid
     union all
     select child.id, chain.depth + 1
     from public.workspace_documents child
     join chain on child.parent_id = chain.id
   )
   select max(depth)::integer from chain),
  16,
  'a 16-level chain is stored');
select throws_ok(
  $q$insert into public.workspace_documents (id, ws_id, name, parent_id)
    values (
      'a1910000-0000-4000-8000-000000000017'::uuid,
      pg_temp.doc(10),
      'Too deep',
      'a1910000-0000-4000-8000-000000000016'::uuid
    )$q$,
  '23514',
  null,
  'depth 17 is rejected');

insert into public.workspace_documents (id, ws_id, name)
values (pg_temp.doc(40), pg_temp.doc(10), 'Subtree root');
do $$
declare
  i integer;
  prev uuid := pg_temp.doc(40);
  doc uuid;
begin
  for i in 1..15 loop
    doc := ('a1920000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into public.workspace_documents (id, ws_id, name, parent_id)
    values (doc, pg_temp.doc(10), 'Sub ' || i, prev);
    prev := doc;
  end loop;
end $$;
insert into public.workspace_documents (id, ws_id, name)
values (pg_temp.doc(41), pg_temp.doc(10), 'Other root');
insert into public.workspace_documents (id, ws_id, name, parent_id)
values (pg_temp.doc(42), pg_temp.doc(10), 'Depth 2', pg_temp.doc(41));
select throws_ok(
  format(
    'update public.workspace_documents set parent_id = %L where id = %L',
    pg_temp.doc(42), pg_temp.doc(40)
  ),
  '23514',
  null,
  'moving a deep subtree under another page is rejected');

insert into public.workspace_documents (id, ws_id, name)
values (pg_temp.doc(50), pg_temp.doc(10), 'Deleted parent');
insert into public.workspace_documents (id, ws_id, name, parent_id)
values (pg_temp.doc(51), pg_temp.doc(10), 'Orphaned child', pg_temp.doc(50));
delete from public.workspace_documents where id = pg_temp.doc(50);
select is(
  (select count(*) from public.workspace_documents where id = pg_temp.doc(51)),
  1::bigint,
  'the child row survives parent deletion');
select is(
  (select parent_id from public.workspace_documents where id = pg_temp.doc(51)),
  null::uuid,
  'the child becomes a root');

insert into public.workspace_documents (id, ws_id, name)
values (pg_temp.doc(60), pg_temp.doc(10), 'Moving parent');
insert into public.workspace_documents (id, ws_id, name, parent_id)
values (pg_temp.doc(61), pg_temp.doc(10), 'Staying child', pg_temp.doc(60));
select throws_ok(
  format(
    'update public.workspace_documents set ws_id = %L where id = %L',
    pg_temp.doc(11), pg_temp.doc(60)
  ),
  '42501',
  null,
  'a page with children cannot change workspace');
insert into public.workspace_documents (id, ws_id, name)
values (pg_temp.doc(62), pg_temp.doc(10), 'Moving leaf');
update public.workspace_documents
set ws_id = pg_temp.doc(11)
where id = pg_temp.doc(62);
select is(
  (select ws_id from public.workspace_documents where id = pg_temp.doc(62)),
  pg_temp.doc(11),
  'a childless root can move workspace');

update public.workspace_documents set position = 4 where id = pg_temp.doc(21);
select is(
  (select position from public.workspace_documents where id = pg_temp.doc(21)),
  4,
  'sibling position updates do not touch the hierarchy trigger');

create function pg_temp.as_role(p_sql text, p_role text, p_user uuid default null)
returns text language plpgsql as $$
declare
  r text;
begin
  if p_user is not null then
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', p_user, 'role', p_role)::text,
      true
    );
  end if;
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    r := 'ok';
  exception when others then
    r := sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;

-- Document writes go through the service role. This grant is rolled back
-- with the test. authenticated has no table privilege here.
grant select, insert, update, delete on table public.workspace_documents to service_role;

select is(
  pg_temp.as_role(
    format(
      'update public.workspace_documents set parent_id = %L where id = %L',
      pg_temp.doc(20), pg_temp.doc(21)
    ),
    'service_role'
  ),
  'ok',
  'service role can parent a page inside the workspace');
select ok(
  pg_temp.as_role(
    format(
      'update public.workspace_documents set parent_id = %L where id = %L',
      pg_temp.doc(23), pg_temp.doc(20)
    ),
    'service_role'
  ) like '42501%same workspace%',
  'service role cannot cross workspaces either');
select is(
  pg_temp.as_role(
    format(
      'update public.workspace_documents set parent_id = %L where id = %L',
      pg_temp.doc(20), pg_temp.doc(21)
    ),
    'authenticated',
    pg_temp.doc(1)
  ),
  '42501 permission denied for table workspace_documents',
  'authenticated has no direct grant on workspace documents');
select is(
  (select parent_id from public.workspace_documents where id = pg_temp.doc(21)),
  pg_temp.doc(20),
  'the in-workspace parent remains after the rejected cross-workspace update');

select * from finish();
rollback;
