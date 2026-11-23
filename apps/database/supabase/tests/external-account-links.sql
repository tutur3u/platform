begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select has_table(
  'private',
  'external_account_links',
  'external account link table exists'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.external_account_links'::regclass
  ),
  'external account links keep row level security enabled'
);

select ok(
  not has_table_privilege('anon', 'private.external_account_links', 'select')
  and not has_table_privilege('anon', 'private.external_account_links', 'insert')
  and not has_table_privilege('anon', 'private.external_account_links', 'update')
  and not has_table_privilege('anon', 'private.external_account_links', 'delete'),
  'anon has no access to external account links'
);

select ok(
  not has_table_privilege('authenticated', 'private.external_account_links', 'select')
  and not has_table_privilege('authenticated', 'private.external_account_links', 'insert')
  and not has_table_privilege('authenticated', 'private.external_account_links', 'update')
  and not has_table_privilege('authenticated', 'private.external_account_links', 'delete'),
  'authenticated has no access to external account links'
);

select ok(
  has_table_privilege('service_role', 'private.external_account_links', 'select')
  and has_table_privilege('service_role', 'private.external_account_links', 'insert')
  and has_table_privilege('service_role', 'private.external_account_links', 'update'),
  'service_role reads and writes external account links'
);

select ok(
  not has_table_privilege('service_role', 'private.external_account_links', 'delete')
  and not has_table_privilege('service_role', 'private.external_account_links', 'truncate'),
  'service_role cannot delete link history'
);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('e3a10000-0000-4000-8000-00000000000a', 'link-a@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('e3a10000-0000-4000-8000-00000000000b', 'link-b@example.com', now(), '{}'::jsonb, '{}'::jsonb);

insert into private.external_account_links (id, user_id, provider, external_subject, scopes, link_jti)
values (
  'e3a10000-0000-4000-9000-000000000001',
  'e3a10000-0000-4000-8000-00000000000a',
  'upskii',
  'upskii-user-1',
  array['upskii:classes:read'],
  'e3a10000-0000-4000-a000-000000000001'
);

select throws_ok(
  $$
    insert into private.external_account_links (user_id, provider, external_subject, link_jti)
    values ('e3a10000-0000-4000-8000-00000000000b', 'upskii', 'upskii-user-7', 'e3a10000-0000-4000-a000-000000000001')
  $$,
  '23505',
  null,
  'a link bearer writes at most one link'
);

select throws_ok(
  $$
    insert into private.external_account_links (user_id, provider, external_subject)
    values ('e3a10000-0000-4000-8000-00000000000a', 'upskii', 'upskii-user-2')
  $$,
  '23505',
  null,
  'a Tuturuuu account holds one active Upskii link'
);

select throws_ok(
  $$
    insert into private.external_account_links (user_id, provider, external_subject)
    values ('e3a10000-0000-4000-8000-00000000000b', 'upskii', 'upskii-user-1')
  $$,
  '23505',
  null,
  'an Upskii account holds one active Tuturuuu link'
);

select throws_ok(
  $$
    insert into private.external_account_links (user_id, provider, external_subject, scopes)
    values ('e3a10000-0000-4000-8000-00000000000b', 'upskii', 'upskii-user-9', array['upskii:classes:write'])
  $$,
  '23514',
  null,
  'links grant only the read scopes'
);

select throws_ok(
  $$
    update private.external_account_links
    set revoked_at = now()
    where id = 'e3a10000-0000-4000-9000-000000000001'
  $$,
  '23514',
  null,
  'a revoked link names who revoked it'
);

update private.external_account_links
set revoked_at = now(), revoked_by = 'user', external_email = null
where id = 'e3a10000-0000-4000-9000-000000000001';

select lives_ok(
  $$
    insert into private.external_account_links (user_id, provider, external_subject)
    values ('e3a10000-0000-4000-8000-00000000000b', 'upskii', 'upskii-user-1')
  $$,
  'a revoked link frees both sides for a new link'
);

select is(
  (
    select count(*)::int
    from private.external_account_links
    where external_subject = 'upskii-user-1'
  ),
  2,
  'revoked links stay as history'
);

delete from auth.users where id = 'e3a10000-0000-4000-8000-00000000000a';

select is(
  (
    select count(*)::int
    from private.external_account_links
    where user_id = 'e3a10000-0000-4000-8000-00000000000a'
  ),
  0,
  'deleting the Tuturuuu account deletes its links'
);

select is(
  (
    select count(*)::int
    from private.external_account_links
    where user_id = 'e3a10000-0000-4000-8000-00000000000b'
  ),
  1,
  'other accounts keep their links'
);

select * from finish();
rollback;
