begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

select is(
  (select prosecdef from pg_proc where oid = 'public.search_users(text,integer,integer,text,boolean)'::regprocedure),
  false,
  'search remains SECURITY INVOKER'
);
select is(
  (select proconfig from pg_proc where oid = 'public.search_users(text,integer,integer,text,boolean)'::regprocedure),
  array['search_path=private, public, pg_temp']::text[],
  'search retains the path set by the Nova team migration'
);

insert into auth.users (id, email) values
  ('a9170000-0000-4000-8000-000000000001', 'search-users-nova-pgtap@example.invalid');
insert into public.users (id, display_name) values
  ('a9170000-0000-4000-8000-000000000001', 'search-users-nova-pgtap')
on conflict (id) do update set display_name = excluded.display_name;
insert into public.user_private_details (user_id, email, full_name) values
  ('a9170000-0000-4000-8000-000000000001', 'search-users-nova-pgtap@example.invalid', 'Nova Search Fixture')
on conflict (user_id) do update set email = excluded.email, full_name = excluded.full_name;
insert into public.platform_user_roles (user_id, enabled, allow_role_management) values
  ('a9170000-0000-4000-8000-000000000001', true, true)
on conflict (user_id) do update set enabled = true, allow_role_management = true;
insert into private.nova_teams (id, name) values
  ('a9170000-0000-4000-8000-000000000002', 'pgTAP Nova search team');
insert into private.nova_team_members (team_id, user_id) values
  ('a9170000-0000-4000-8000-000000000002', 'a9170000-0000-4000-8000-000000000001');

set local role service_role;

select is(current_user::text, 'service_role', 'search executes as the Nova admin client role');
select results_eq(
  $$select id, full_name, team_name from public.search_users('search-users-nova-pgtap', 1, 10)$$,
  $$values ('a9170000-0000-4000-8000-000000000001'::uuid, 'Nova Search Fixture'::text, array['pgTAP Nova search team']::text[])$$,
  'admin search returns the user and private Nova team'
);
select results_eq(
  $$select id from public.search_users('search-users-nova-pgtap@example.invalid', 1, 10, 'admin', true)$$,
  $$values ('a9170000-0000-4000-8000-000000000001'::uuid)$$,
  'email search preserves role and enabled filters'
);
select is(
  (select count(*) from public.search_users('search-users-nova-pgtap', 1, 10, 'admin', false)),
  0::bigint,
  'enabled filter excludes the fixture'
);
select is(
  (select count(*) from public.search_users('search-users-nova-pgtap', 2, 10)),
  0::bigint,
  'pagination skips the first page'
);

reset role;
select * from finish();
rollback;
