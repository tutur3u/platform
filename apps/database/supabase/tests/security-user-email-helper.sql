begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(17);

insert into auth.users (id, email, email_confirmed_at) values
  ('e1000000-0000-0000-0000-000000000001', 'email-helper-a@example.test', now()),
  ('e1000000-0000-0000-0000-000000000002', 'email-helper-b@example.test', now());

insert into public.users (id)
select id from auth.users where id::text like 'e1000000-%'
on conflict do nothing;

insert into public.notifications (id, user_id, email, scope, type, title)
values
  (
    'e1000000-0000-0000-0000-0000000000a1',
    'e1000000-0000-0000-0000-000000000001',
    null,
    'user',
    'account_update',
    'A own notification'
  ),
  (
    'e1000000-0000-0000-0000-0000000000b1',
    'e1000000-0000-0000-0000-000000000002',
    null,
    'user',
    'account_update',
    'B own notification'
  ),
  (
    'e1000000-0000-0000-0000-0000000000b2',
    null,
    'email-helper-b@example.test',
    'user',
    'workspace_invite',
    'B pending invite'
  );

select ok(
  to_regprocedure('public.get_user_email(uuid)') is null,
  'The arbitrary-user email lookup no longer exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_current_user_email()',
    'execute'
  ),
  'anon cannot execute the current-user email helper'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_current_user_email()',
    'execute'
  ),
  'authenticated can execute the current-user email helper'
);

select ok(
  not has_function_privilege('anon', 'public.sync_my_notifications()', 'execute'),
  'anon cannot execute the notification sync RPC'
);

select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.get_current_user_email()'::regprocedure
  ),
  array['search_path=""']::text[],
  'The email helper pins an empty search_path'
);

select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.sync_my_notifications()'::regprocedure
  ),
  array['search_path=""']::text[],
  'The notification sync RPC pins an empty search_path'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname in (
        'notifications_select_policy',
        'notifications_update_policy',
        'notifications_delete_policy'
      )
      and roles = array['authenticated']::name[]
  ),
  3,
  'Notification read, update and delete policies apply only to authenticated'
);

-- API roles hold no notification table privileges once notifications are
-- fully server-owned. Grant inside this rolled-back transaction so the
-- policies are still exercised as defence in depth.
grant select, update on public.notifications to authenticated;

-- Anonymous callers.
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select throws_ok(
  $$select public.get_current_user_email()$$,
  '42501',
  null,
  'anon is denied the current-user email helper'
);

select throws_ok(
  $$select * from public.sync_my_notifications()$$,
  '42501',
  null,
  'anon is denied the notification sync RPC'
);

reset role;

-- Authenticated caller A.
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e1000000-0000-0000-0000-000000000001"}',
  true
);
set local role authenticated;

select is(
  public.get_current_user_email(),
  'email-helper-a@example.test',
  'The helper returns only the caller''s own email'
);

select is(
  (
    select array_agg(id order by id)
    from public.notifications
    where id::text like 'e1000000-%'
  ),
  array['e1000000-0000-0000-0000-0000000000a1']::uuid[],
  'A sees only A''s notification, not B''s user or email rows'
);

select lives_ok(
  $$update public.notifications
    set read_at = now()
    where id = 'e1000000-0000-0000-0000-0000000000b2'$$,
  'A may attempt to update a notification addressed to B''s email'
);

reset role;

select is(
  (
    select read_at
    from public.notifications
    where id = 'e1000000-0000-0000-0000-0000000000b2'
  ),
  null::timestamptz,
  'The update by A did not touch the notification addressed to B''s email'
);

reset role;

-- Authenticated caller B.
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e1000000-0000-0000-0000-000000000002"}',
  true
);
set local role authenticated;

select is(
  public.get_current_user_email(),
  'email-helper-b@example.test',
  'The helper follows the session, not a caller-supplied id'
);

select is(
  (
    select array_agg(id order by id)
    from public.notifications
    where id::text like 'e1000000-%'
  ),
  array[
    'e1000000-0000-0000-0000-0000000000b1',
    'e1000000-0000-0000-0000-0000000000b2'
  ]::uuid[],
  'B sees B''s user row and the invite addressed to B''s email'
);

reset role;

-- A session without a user resolves to no email.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;

select is(
  public.get_current_user_email(),
  null::text,
  'A session without a subject resolves to no email'
);

reset role;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select lives_ok(
  $$select public.get_current_user_email()$$,
  'service_role keeps access to the helper'
);

reset role;

select * from finish();

rollback;
