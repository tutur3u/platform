begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(32);

-- Privileges and shape.
select ok(
  not has_table_privilege('anon', 'public.notifications', 'select')
  and not has_table_privilege('anon', 'public.notifications', 'insert')
  and not has_table_privilege('anon', 'public.notifications', 'update')
  and not has_table_privilege('anon', 'public.notifications', 'delete'),
  'anon holds no notification table privileges'
);

select ok(
  not has_table_privilege('authenticated', 'public.notifications', 'select')
  and not has_table_privilege('authenticated', 'public.notifications', 'insert')
  and not has_table_privilege('authenticated', 'public.notifications', 'update')
  and not has_table_privilege('authenticated', 'public.notifications', 'delete'),
  'authenticated holds no notification table privileges'
);

select ok(
  has_table_privilege('service_role', 'public.notifications', 'select')
  and has_table_privilege('service_role', 'public.notifications', 'update'),
  'service_role keeps notification table access'
);

select is(
  (
    select confdeltype::text
    from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_user_id_fkey'
  ),
  'c',
  'Deleting a recipient account deletes its notifications'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'auth.users'::regclass
      and tgname = 'trigger_claim_email_invite_notifications_on_confirm'
      and not tgisinternal
  ),
  'Invitations are claimed when an address is confirmed or changed'
);

select is(
  (
    select array_agg(distinct array_to_string(proconfig, ','))
    from pg_proc
    where oid in (
      'public.migrate_email_notifications_on_signup()'::regprocedure,
      'public.migrate_email_notifications_on_login()'::regprocedure,
      'private.claim_email_invite_notifications()'::regprocedure,
      'private.claim_email_invite_notifications_for(uuid, text, timestamptz)'::regprocedure
    )
  ),
  array['search_path=pg_catalog, pg_temp']::text[],
  'Claim functions pin catalog lookup with pg_temp last'
);

select ok(
  not has_function_privilege('anon', 'public.sync_my_notifications()', 'execute'),
  'anon cannot execute the notification sync RPC'
);

-- Fixtures.
select set_config('request.jwt.claims', '{}', true);

insert into auth.users (id, email, email_confirmed_at) values
  ('e2000000-0000-0000-0000-000000000001', 'notif-owner@example.test', now()),
  ('e2000000-0000-0000-0000-000000000002', 'notif-other@example.test', now());

insert into public.users (id)
select id from auth.users where id::text like 'e2000000-%'
on conflict do nothing;

-- Normalization on write.
insert into public.notifications (id, user_id, email, scope, type, title)
values (
  'e2000000-0000-0000-0000-0000000000c1',
  null,
  '  Pending-Invitee@Example.TEST ',
  'user',
  'workspace_invite',
  'Pending invite'
);

select is(
  (select email from public.notifications where id = 'e2000000-0000-0000-0000-0000000000c1'),
  'pending-invitee@example.test',
  'Email-addressed rows store a trimmed, lowercased address'
);

insert into public.notifications (id, user_id, email, scope, type, title)
values (
  'e2000000-0000-0000-0000-0000000000a1',
  'e2000000-0000-0000-0000-000000000001',
  'notif-owner@example.test',
  'user',
  'account_update',
  'Owner notification'
);

select is(
  (select email from public.notifications where id = 'e2000000-0000-0000-0000-0000000000a1'),
  null::text,
  'Rows addressed to an account keep no address copy'
);

-- An unconfirmed account does not claim invitations for its address.
select set_config('request.jwt.claims', '{}', true);

insert into auth.users (id, email, email_confirmed_at) values
  ('e2000000-0000-0000-0000-000000000003', 'pending-invitee@example.test', null);

insert into public.users (id)
values ('e2000000-0000-0000-0000-000000000003')
on conflict do nothing;

select is(
  (select user_id from public.notifications where id = 'e2000000-0000-0000-0000-0000000000c1'),
  null::uuid,
  'An unconfirmed account does not claim invitations'
);

update auth.users
set email_confirmed_at = now()
where id = 'e2000000-0000-0000-0000-000000000003';

select is(
  (select user_id from public.notifications where id = 'e2000000-0000-0000-0000-0000000000c1'),
  'e2000000-0000-0000-0000-000000000003'::uuid,
  'Confirming the address claims the invitation'
);

select is(
  (select email from public.notifications where id = 'e2000000-0000-0000-0000-0000000000c1'),
  null::text,
  'A claimed invitation drops its address copy'
);

-- A confirmed address change claims invitations for the new address only, and
-- never moves rows owned by another account.
insert into public.notifications (id, user_id, email, scope, type, title)
values
  (
    'e2000000-0000-0000-0000-0000000000c2',
    null,
    'notif-renamed@example.test',
    'user',
    'workspace_invite',
    'Invite for new address'
  ),
  (
    'e2000000-0000-0000-0000-0000000000d1',
    null,
    'notif-renamed@example.test',
    'user',
    'account_update',
    'Non-invite row addressed by email'
  );

update auth.users
set email = 'Notif-Renamed@Example.test'
where id = 'e2000000-0000-0000-0000-000000000002';

select is(
  (select user_id from public.notifications where id = 'e2000000-0000-0000-0000-0000000000c2'),
  'e2000000-0000-0000-0000-000000000002'::uuid,
  'A confirmed address change claims invitations for the new address'
);

select is(
  (select user_id from public.notifications where id = 'e2000000-0000-0000-0000-0000000000d1'),
  null::uuid,
  'Only invitation rows are claimed by address'
);

select is(
  (select user_id from public.notifications where id = 'e2000000-0000-0000-0000-0000000000a1'),
  'e2000000-0000-0000-0000-000000000001'::uuid,
  'Rows owned by another account are never reassigned'
);

-- On-demand sync follows the same rule for the caller's confirmed address.
insert into public.notifications (id, user_id, email, scope, type, title)
values (
  'e2000000-0000-0000-0000-0000000000c3',
  null,
  'notif-owner@example.test',
  'user',
  'workspace_invite',
  'Late invite'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e2000000-0000-0000-0000-000000000001"}',
  true
);
set local role authenticated;

select is(
  public.get_current_user_email(),
  'notif-owner@example.test',
  'The helper returns the caller''s confirmed, normalized address'
);

select is(
  (select updated_count from public.sync_my_notifications()),
  1,
  'Sync claims the caller''s unclaimed invitation'
);

select throws_ok(
  $$select count(*) from public.notifications$$,
  '42501',
  null,
  'authenticated cannot read the table directly'
);

reset role;

select is(
  (select user_id from public.notifications where id = 'e2000000-0000-0000-0000-0000000000c3'),
  'e2000000-0000-0000-0000-000000000001'::uuid,
  'Sync assigned the invitation to the caller'
);

select is(
  (select user_id from public.notifications where id = 'e2000000-0000-0000-0000-0000000000d1'),
  null::uuid,
  'Sync leaves non-invitation rows untouched'
);

-- Unconfirmed sessions resolve to no address and claim nothing.
-- RESET ROLE retains JWT claims; signup setup must not inherit the last caller.
select set_config('request.jwt.claims', '{}', true);

insert into auth.users (id, email, email_confirmed_at) values
  ('e2000000-0000-0000-0000-000000000004', 'notif-unconfirmed@example.test', null);

insert into public.users (id)
values ('e2000000-0000-0000-0000-000000000004')
on conflict do nothing;

insert into public.notifications (id, user_id, email, scope, type, title)
values (
  'e2000000-0000-0000-0000-0000000000c4',
  null,
  'notif-unconfirmed@example.test',
  'user',
  'workspace_invite',
  'Invite for unconfirmed address'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e2000000-0000-0000-0000-000000000004"}',
  true
);
set local role authenticated;

select is(
  public.get_current_user_email(),
  null::text,
  'An unconfirmed session resolves to no address'
);

select is(
  (select updated_count from public.sync_my_notifications()),
  0,
  'An unconfirmed session claims nothing'
);

reset role;

-- Policies stay correct as defence in depth if table access were re-granted.
grant select, update on public.notifications to authenticated;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e2000000-0000-0000-0000-000000000002"}',
  true
);
set local role authenticated;

select is(
  (
    select array_agg(id order by id)
    from public.notifications
    where id::text like 'e2000000-%'
  ),
  array['e2000000-0000-0000-0000-0000000000c2']::uuid[],
  'Policies expose only rows assigned to the caller'
);

reset role;

insert into public.notifications (id, user_id, email, scope, type, title)
values (
  'e2000000-0000-0000-0000-0000000000c5',
  null,
  'notif-renamed@example.test',
  'user',
  'workspace_invite',
  'Unclaimed invite for caller address'
);

set local role authenticated;

select is(
  (
    select array_agg(id order by id)
    from public.notifications
    where id::text like 'e2000000-%'
  ),
  array[
    'e2000000-0000-0000-0000-0000000000c2',
    'e2000000-0000-0000-0000-0000000000c5'
  ]::uuid[],
  'Policies add unclaimed invitations for the confirmed address, not other email rows'
);

reset role;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e2000000-0000-0000-0000-000000000004"}',
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.notifications
    where id::text like 'e2000000-%'
  ),
  0,
  'An unconfirmed session sees no email-addressed invitation'
);

reset role;

-- A legacy address copy on a row that already has a recipient is never matched
-- or reassigned, even when another account later confirms that address.
alter table public.notifications disable trigger normalize_notification_email;

insert into public.notifications (id, user_id, email, scope, type, title)
values (
  'e2000000-0000-0000-0000-0000000000e1',
  'e2000000-0000-0000-0000-000000000001',
  'notif-recycled@example.test',
  'user',
  'workspace_invite',
  'Owned row with a legacy address copy'
);

alter table public.notifications enable trigger normalize_notification_email;

select set_config('request.jwt.claims', '{}', true);

insert into auth.users (id, email, email_confirmed_at) values
  ('e2000000-0000-0000-0000-000000000005', 'notif-recycled@example.test', null);

insert into public.users (id)
values ('e2000000-0000-0000-0000-000000000005')
on conflict do nothing;

update auth.users
set email_confirmed_at = now()
where id = 'e2000000-0000-0000-0000-000000000005';

select is(
  (select user_id from public.notifications where id = 'e2000000-0000-0000-0000-0000000000e1'),
  'e2000000-0000-0000-0000-000000000001'::uuid,
  'A recycled address never reassigns a row that has a recipient'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e2000000-0000-0000-0000-000000000005"}',
  true
);
set local role authenticated;

select is(
  (select updated_count from public.sync_my_notifications()),
  0,
  'Sync never reassigns a row that has a recipient'
);

select is(
  (
    select count(*)::integer
    from public.notifications
    where id = 'e2000000-0000-0000-0000-0000000000e1'
  ),
  0,
  'A recycled address does not expose a row that has a recipient'
);

select lives_ok(
  $$update public.notifications set read_at = now() where id = 'e2000000-0000-0000-0000-0000000000e1'$$,
  'A non-recipient may attempt an update'
);

reset role;

select is(
  (select read_at from public.notifications where id = 'e2000000-0000-0000-0000-0000000000e1'),
  null::timestamptz,
  'The update policy does not let a non-recipient change the row'
);

-- An account created with an already-confirmed address (for example OAuth)
-- claims its pending invitation at creation.
insert into public.notifications (id, user_id, email, scope, type, title)
values (
  'e2000000-0000-0000-0000-0000000000c6',
  null,
  'notif-oauth@example.test',
  'user',
  'workspace_invite',
  'Invite before an OAuth signup'
);

select set_config('request.jwt.claims', '{}', true);

insert into auth.users (id, email, email_confirmed_at) values
  ('e2000000-0000-0000-0000-000000000006', 'Notif-OAuth@example.test', now());

select is(
  (select user_id from public.notifications where id = 'e2000000-0000-0000-0000-0000000000c6'),
  'e2000000-0000-0000-0000-000000000006'::uuid,
  'An account created with a confirmed address claims its invitation'
);

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select throws_ok(
  $$select count(*) from public.notifications$$,
  '42501',
  null,
  'anon cannot read the table directly'
);

reset role;

select * from finish();

rollback;
