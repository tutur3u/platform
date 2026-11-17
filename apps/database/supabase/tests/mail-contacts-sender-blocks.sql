-- Mail × Contacts: mailbox workspace link, per-mailbox sender blocks and the
-- service-managed Contacts mail_blocked flag.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(26);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('37900000-0000-4000-8000-000000000001', 'n72-owner@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('37900000-0000-4000-8000-000000000002', 'n72-member@example.com', now(), '{}'::jsonb, '{}'::jsonb);

-- Runs one statement as the user under RLS; returns 'ok' or the SQLSTATE.
create function pg_temp.as_user(p_user uuid, p_sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated',
    'email', (select email from auth.users where id = p_user))::text, true);
  execute 'set local role authenticated';
  begin
    if p_sql ~* '^\s*select' then execute p_sql into r; else execute p_sql; end if;
    r := coalesce(r, 'ok');
  exception when others then r := sqlstate;
  end;
  execute 'reset role';
  return r;
end $$;
-- Runs one statement with the given JWT role as the API's service client does.
create function pg_temp.as_service(p_sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  begin
    execute p_sql;
    r := 'ok';
  exception when others then r := sqlstate;
  end;
  execute 'reset role';
  return r;
end $$;

-- Signing up creates the owner's personal workspace.
insert into public.workspaces (id, name, personal, creator_id)
select '37900000-0000-4000-8000-0000000000a1', 'N72 personal', true, '37900000-0000-4000-8000-000000000001'
where not exists (
  select 1 from public.workspaces
  where creator_id = '37900000-0000-4000-8000-000000000001' and personal
);
insert into public.workspaces (id, name, personal, creator_id) values
  ('37900000-0000-4000-8000-0000000000a2', 'N72 team', false, '37900000-0000-4000-8000-000000000001');
insert into public.workspace_members (ws_id, user_id, type) values
  ('37900000-0000-4000-8000-0000000000a2', '37900000-0000-4000-8000-000000000001', 'MEMBER'),
  ('37900000-0000-4000-8000-0000000000a2', '37900000-0000-4000-8000-000000000002', 'MEMBER')
on conflict do nothing;
insert into public.workspace_users (id, ws_id, email, display_name) values
  ('37900000-0000-4000-8000-0000000000c1', '37900000-0000-4000-8000-0000000000a2', 'team@sepay.vn', 'Team SePay');

insert into private.mail_domains (id, domain, status, inbound_provider, verified_at)
values ('37900000-0000-4000-8000-0000000000d0', 'tuturuuu.com', 'active', 'cloudflare', now())
on conflict do nothing;
-- d1 personal, single owner = creator; d2 shared; d3 personal with two
-- owners (e.g. after an adoption); d4 a company-provisioned employee mailbox.
insert into private.mail_mailboxes (id, domain_id, address, type, status, created_by)
select v.id, d.id, v.address, v.type, 'active', v.created_by
from private.mail_domains d
cross join (values
  ('37900000-0000-4000-8000-0000000000d1'::uuid, 'n72-personal@tuturuuu.com', 'personal', '37900000-0000-4000-8000-000000000001'::uuid),
  ('37900000-0000-4000-8000-0000000000d2'::uuid, 'n72-shared@tuturuuu.com', 'shared', '37900000-0000-4000-8000-000000000001'::uuid),
  ('37900000-0000-4000-8000-0000000000d3'::uuid, 'n72-two-owners@tuturuuu.com', 'personal', '37900000-0000-4000-8000-000000000002'::uuid),
  ('37900000-0000-4000-8000-0000000000d4'::uuid, 'n72-employee@tuturuuu.com', 'personal', '37900000-0000-4000-8000-000000000002'::uuid)
) as v(id, address, type, created_by)
where d.domain = 'tuturuuu.com';
insert into private.mail_mailbox_members (mailbox_id, user_id, role) values
  ('37900000-0000-4000-8000-0000000000d1', '37900000-0000-4000-8000-000000000001', 'owner'),
  ('37900000-0000-4000-8000-0000000000d2', '37900000-0000-4000-8000-000000000001', 'owner'),
  ('37900000-0000-4000-8000-0000000000d3', '37900000-0000-4000-8000-000000000001', 'owner'),
  ('37900000-0000-4000-8000-0000000000d3', '37900000-0000-4000-8000-000000000002', 'owner'),
  ('37900000-0000-4000-8000-0000000000d4', '37900000-0000-4000-8000-000000000002', 'owner');
insert into private.infrastructure_employees (user_id, staff_email, managed_name, mailbox_id)
values ('37900000-0000-4000-8000-000000000002', 'n72-employee@tuturuuu.com', 'N72 Employee',
  '37900000-0000-4000-8000-0000000000d4');

-- Mailbox workspace link
select has_column('private', 'mail_mailboxes', 'ws_id', 'mailboxes carry a workspace link');
select cmp_ok(private.link_personal_mailbox_workspaces(), '>=', 1, 'backfill links personal mailboxes');
select is(
  (select ws_id from private.mail_mailboxes where id = '37900000-0000-4000-8000-0000000000d1'),
  (select id from public.workspaces
    where creator_id = '37900000-0000-4000-8000-000000000001' and personal),
  'a personal mailbox links to its owner''s personal workspace'
);
select is(
  (select ws_id from private.mail_mailboxes where id = '37900000-0000-4000-8000-0000000000d2'),
  null::uuid,
  'a shared mailbox stays unlinked'
);
select is(
  (select ws_id from private.mail_mailboxes where id = '37900000-0000-4000-8000-0000000000d3'),
  null::uuid,
  'a personal mailbox with two owners stays unlinked'
);
select is(
  (select ws_id from private.mail_mailboxes where id = '37900000-0000-4000-8000-0000000000d4'),
  null::uuid,
  'a company-provisioned employee mailbox stays unlinked'
);
select is(
  private.link_personal_mailbox_workspaces('37900000-0000-4000-8000-0000000000d3'),
  0,
  'a targeted call cannot link an ambiguous mailbox'
);
select is(private.link_personal_mailbox_workspaces(), 0, 'the backfill is idempotent');
select ok(
  not has_function_privilege('authenticated', 'private.link_personal_mailbox_workspaces(uuid)', 'execute'),
  'clients cannot run the backfill'
);

-- Sender blocks: private, service-role only
select ok(
  (select relrowsecurity from pg_class where oid = 'private.mail_sender_blocks'::regclass),
  'sender blocks keep row level security enabled'
);
select ok(
  not has_table_privilege('authenticated', 'private.mail_sender_blocks', 'select')
  and not has_table_privilege('anon', 'private.mail_sender_blocks', 'select')
  and not has_table_privilege('authenticated', 'private.mail_sender_blocks', 'insert'),
  'clients have no direct access to sender blocks'
);
select is(
  pg_temp.as_service($q$insert into private.mail_sender_blocks (mailbox_id, kind, value, contact_id, created_by)
    values ('37900000-0000-4000-8000-0000000000d2', 'address', 'team@sepay.vn',
      '37900000-0000-4000-8000-0000000000c1', '37900000-0000-4000-8000-000000000001')$q$),
  'ok',
  'the service role records an address block'
);
select is(
  pg_temp.as_service($q$insert into private.mail_sender_blocks (mailbox_id, kind, value)
    values ('37900000-0000-4000-8000-0000000000d2', 'domain', 'sepay.vn')$q$),
  'ok',
  'the service role records a domain block'
);
select is(
  pg_temp.as_service($q$insert into private.mail_sender_blocks (mailbox_id, kind, value)
    values ('37900000-0000-4000-8000-0000000000d2', 'address', 'team@sepay.vn')$q$),
  '23505',
  'a block is unique per mailbox, kind and value'
);
select is(
  pg_temp.as_service($q$insert into private.mail_sender_blocks (mailbox_id, kind, value)
    values ('37900000-0000-4000-8000-0000000000d2', 'address', 'Team@SePay.vn')$q$),
  '23514',
  'block values must be lowercase'
);
select is(
  pg_temp.as_service($q$insert into private.mail_sender_blocks (mailbox_id, kind, value)
    values ('37900000-0000-4000-8000-0000000000d2', 'domain', '@sepay.vn')$q$),
  '23514',
  'a domain block is a bare domain'
);
select is(
  pg_temp.as_service($q$insert into private.mail_sender_blocks (mailbox_id, kind, value)
    values ('37900000-0000-4000-8000-0000000000d2', 'address', 'not-an-address')$q$),
  '23514',
  'an address block is an address'
);
select is(
  pg_temp.as_user('37900000-0000-4000-8000-000000000001',
    $q$select count(*)::text from private.mail_sender_blocks$q$),
  '42501',
  'even a mailbox owner cannot read blocks directly'
);

-- Contacts mail_blocked flag
select is(
  (select mail_blocked from public.workspace_users where id = '37900000-0000-4000-8000-0000000000c1'),
  false,
  'contacts default to not blocked'
);
select is(
  pg_temp.as_user('37900000-0000-4000-8000-000000000002',
    $q$update public.workspace_users set display_name = 'SePay' where id = '37900000-0000-4000-8000-0000000000c1'$q$),
  'ok',
  'members keep editing other contact fields'
);
select is(
  pg_temp.as_user('37900000-0000-4000-8000-000000000002',
    $q$update public.workspace_users set mail_blocked = true where id = '37900000-0000-4000-8000-0000000000c1'$q$),
  '42501',
  'members cannot set mail_blocked directly'
);
select is(
  pg_temp.as_user('37900000-0000-4000-8000-000000000002',
    $q$insert into public.workspace_users (ws_id, email, display_name, mail_blocked)
      values ('37900000-0000-4000-8000-0000000000a2', 'x@example.com', 'X', true)$q$),
  '42501',
  'members cannot create a contact already marked blocked'
);
select is(
  pg_temp.as_service($q$update public.workspace_users set mail_blocked = true
    where id = '37900000-0000-4000-8000-0000000000c1'$q$),
  'ok',
  'the service role mirrors a block onto the contact'
);
select lives_ok(
  $q$delete from private.mail_sender_blocks where mailbox_id = '37900000-0000-4000-8000-0000000000d2'
    and kind = 'domain'$q$,
  'block rules can be removed'
);
select is(
  (select count(*)::int from private.mail_sender_blocks
    where mailbox_id = '37900000-0000-4000-8000-0000000000d2'),
  1,
  'removing one rule keeps the others'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'private.mail_sender_blocks'::regclass
      and contype = 'f'
      and confrelid = 'private.mail_mailboxes'::regclass
      and confdeltype = 'c'
  ),
  'block rules cascade with their mailbox'
);

select * from finish();
rollback;
