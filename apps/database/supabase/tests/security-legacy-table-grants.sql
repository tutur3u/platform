begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(30);

select ok((select relrowsecurity from pg_class where oid = 'public.hive_npc_memories'::regclass), 'hive_npc_memories: RLS enabled');
select is(
  (select count(*) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
   where has_table_privilege('anon', 'public.hive_npc_memories', p)),
  0::bigint, 'hive_npc_memories: anon has no table privileges');
select is(
  (select array_agg(p order by p) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
   where has_table_privilege('authenticated', 'public.hive_npc_memories', p)),
  array['SELECT']::text[], 'hive_npc_memories: authenticated has exactly the policy operations');
select ok((select bool_and(has_table_privilege('service_role', 'public.hive_npc_memories', p))
  from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p),
  'hive_npc_memories: service_role retains prior grants');

select ok((select relrowsecurity from pg_class where oid = 'public.hive_npcs'::regclass), 'hive_npcs: RLS enabled');
select is(
  (select count(*) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
   where has_table_privilege('anon', 'public.hive_npcs', p)),
  0::bigint, 'hive_npcs: anon has no table privileges');
select is(
  (select array_agg(p order by p) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
   where has_table_privilege('authenticated', 'public.hive_npcs', p)),
  array['SELECT']::text[], 'hive_npcs: authenticated has exactly the policy operations');
select ok((select bool_and(has_table_privilege('service_role', 'public.hive_npcs', p))
  from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p),
  'hive_npcs: service_role retains prior grants');

select ok((select relrowsecurity from pg_class where oid = 'public.hive_servers'::regclass), 'hive_servers: RLS enabled');
select is(
  (select count(*) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
   where has_table_privilege('anon', 'public.hive_servers', p)),
  0::bigint, 'hive_servers: anon has no table privileges');
select is(
  (select array_agg(p order by p) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
   where has_table_privilege('authenticated', 'public.hive_servers', p)),
  array['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[], 'hive_servers: authenticated has exactly the policy operations');
select ok((select bool_and(has_table_privilege('service_role', 'public.hive_servers', p))
  from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p),
  'hive_servers: service_role retains prior grants');

select ok((select relrowsecurity from pg_class where oid = 'public.hive_workflows'::regclass), 'hive_workflows: RLS enabled');
select is(
  (select count(*) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
   where has_table_privilege('anon', 'public.hive_workflows', p)),
  0::bigint, 'hive_workflows: anon has no table privileges');
select is(
  (select array_agg(p order by p) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
   where has_table_privilege('authenticated', 'public.hive_workflows', p)),
  array['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[], 'hive_workflows: authenticated has exactly the policy operations');
select ok((select bool_and(has_table_privilege('service_role', 'public.hive_workflows', p))
  from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p),
  'hive_workflows: service_role retains prior grants');

select ok((select relrowsecurity from pg_class where oid = 'public.hive_research_sessions'::regclass), 'hive_research_sessions: RLS enabled');
select is(
  (select count(*) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
   where has_table_privilege('anon', 'public.hive_research_sessions', p)),
  0::bigint, 'hive_research_sessions: anon has no table privileges');
select is(
  (select array_agg(p order by p) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
   where has_table_privilege('authenticated', 'public.hive_research_sessions', p)),
  array['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[], 'hive_research_sessions: authenticated has exactly the policy operations');
select ok((select bool_and(has_table_privilege('service_role', 'public.hive_research_sessions', p))
  from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p),
  'hive_research_sessions: service_role retains prior grants');

select ok((select relrowsecurity from pg_class where oid = 'public.workspace_external_project_field_definitions'::regclass), 'workspace_external_project_field_definitions: RLS enabled');
select is(
  (select count(*) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
   where has_table_privilege('anon', 'public.workspace_external_project_field_definitions', p)),
  0::bigint, 'workspace_external_project_field_definitions: anon has no table privileges');
select is(
  (select array_agg(p order by p) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
   where has_table_privilege('authenticated', 'public.workspace_external_project_field_definitions', p)),
  array['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[], 'workspace_external_project_field_definitions: authenticated has exactly the policy operations');
select ok((select bool_and(has_table_privilege('service_role', 'public.workspace_external_project_field_definitions', p))
  from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p),
  'workspace_external_project_field_definitions: service_role retains prior grants');

select is((select count(*) from pg_policies where schemaname = 'public' and tablename in ('hive_npc_memories','hive_npcs','hive_servers','hive_workflows','hive_research_sessions','workspace_external_project_field_definitions') and roles && array['public','anon']::name[]), 0::bigint, 'no policies target PUBLIC or anon');

-- A Hive member can still read NPC data through the authenticated role.
insert into auth.users(id) values ('00000000-0000-4000-8000-000000009891');
insert into public.users(id) values ('00000000-0000-4000-8000-000000009891') on conflict do nothing;
insert into public.hive_members(user_id) values ('00000000-0000-4000-8000-000000009891');
insert into public.hive_servers(id, name, slug) values
  ('00000000-0000-4000-8000-000000009892', 'Grant test', 'legacy-grant-test');
insert into public.hive_npcs(id, server_id, name) values
  ('00000000-0000-4000-8000-000000009893', '00000000-0000-4000-8000-000000009892', 'Grant test NPC');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000009891","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000009891', true);
set local role authenticated;
select ok(public.account_required_mfa_satisfied(), 'fixture satisfies the existing restrictive account policy');
select is(auth.uid(), '00000000-0000-4000-8000-000000009891'::uuid, 'fixture authenticates the intended Hive member');
select is((select name from public.hive_npcs where id = '00000000-0000-4000-8000-000000009893'),
  'Grant test NPC', 'authenticated Hive member can read an NPC');
select throws_ok(
  $$insert into public.hive_npcs(server_id, name) values ('00000000-0000-4000-8000-000000009892', 'Denied')$$,
  '42501', 'permission denied for table hive_npcs', 'SELECT-only NPC policy needs no write grant');
select throws_ok(
  $$insert into public.hive_servers(name, slug) values ('Denied', 'legacy-grant-denied')$$,
  '42501', 'new row violates row-level security policy for table "hive_servers"',
  'unchanged server policy denies a non-admin member write');
reset role;
select * from finish();
rollback;
