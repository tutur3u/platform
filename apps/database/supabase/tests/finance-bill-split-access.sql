begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(40);

select is(
  (select count(*) from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'private'
       and c.relname in ('finance_bill_splits', 'finance_bill_split_participants',
         'finance_bill_split_revisions')
       and c.relrowsecurity),
  3::bigint,
  'All bill split relations are private with RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'private.finance_bill_splits', 'select,insert,update,delete'),
  'Anonymous clients cannot access split headers'
);
select ok(
  not has_table_privilege('authenticated', 'private.finance_bill_splits', 'select,insert,update,delete'),
  'Authenticated clients cannot bypass authorized APIs for split headers'
);
select ok(
  not has_table_privilege('anon', 'private.finance_bill_split_participants', 'select,insert,update,delete'),
  'Anonymous clients cannot access participants'
);
select ok(
  not has_table_privilege('authenticated', 'private.finance_bill_split_participants', 'select,insert,update,delete'),
  'Authenticated clients cannot bypass authorized APIs for participants'
);
select ok(
  not has_table_privilege('anon', 'private.finance_bill_split_revisions', 'select,insert,update,delete'),
  'Anonymous clients cannot access revisions'
);
select ok(
  not has_table_privilege('authenticated', 'private.finance_bill_split_revisions', 'select,insert,update,delete'),
  'Authenticated clients cannot bypass authorized APIs for revisions'
);
select ok(
  has_table_privilege('service_role', 'private.finance_bill_split_revisions', 'select')
  and has_table_privilege('service_role', 'private.finance_bill_split_revisions', 'insert'),
  'The authorized service can read and append revisions'
);
select ok(
  not has_table_privilege('service_role', 'private.finance_bill_split_revisions', 'update,delete,truncate'),
  'The service cannot overwrite or remove revisions directly'
);
select is(
  (select count(*) from pg_catalog.pg_constraint
     where conrelid = 'private.finance_bill_split_participants'::regclass
       and contype = 'f' and cardinality(conkey) = 2),
  3::bigint,
  'A participant references a split and directory identities within its own workspace'
);

select ok(
  not has_table_privilege('authenticated', 'private.finance_bill_split_activity', 'select,insert,update,delete'),
  'Clients access payment activity through actor-scoped APIs'
);
select ok(
  not has_table_privilege('anon', 'private.finance_bill_split_status_links', 'select,insert,update,delete'),
  'Anonymous status readers cannot access token digests directly'
);
select ok(
  not has_function_privilege('anon', 'private.lookup_finance_bill_split_link(text)', 'execute'),
  'Anonymous clients cannot bypass status admission'
);
select ok(
  not has_table_privilege('authenticated', 'private.finance_contact_bank_accounts', 'select,insert,update,delete'),
  'Authenticated clients cannot read encrypted contact bank accounts directly'
);
select ok(
  not has_function_privilege('authenticated',
    'private.finance_contact_bank_command(uuid,uuid,uuid,text,text,text,text,text,uuid)', 'execute'),
  'Authenticated clients cannot bypass consent and bank read authorization'
);

insert into public.users (id) values
  ('97049000-0000-4000-8000-000000000001'),
  ('97049000-0000-4000-8000-000000000002'),
  ('97049000-0000-4000-8000-000000000003');

insert into public.workspaces (id, name, personal, creator_id) values
  ('97049000-0000-4000-8000-000000000010', 'Synthetic split workspace', false, '97049000-0000-4000-8000-000000000001');
insert into public.workspace_members (ws_id, user_id, type) values
  ('97049000-0000-4000-8000-000000000010', '97049000-0000-4000-8000-000000000002', 'MEMBER'),
  ('97049000-0000-4000-8000-000000000010', '97049000-0000-4000-8000-000000000003', 'MEMBER')
on conflict (ws_id, user_id) do nothing;

delete from public.workspace_default_permissions
where ws_id = '97049000-0000-4000-8000-000000000010';
insert into public.workspace_default_permissions (ws_id, permission, enabled, member_type)
values ('97049000-0000-4000-8000-000000000010', 'view_transactions', true, 'MEMBER');

select private.create_finance_bill_split(
  '97049000-0000-4000-8000-000000000010', '97049000-0000-4000-8000-000000000001',
  '97049000-0000-4000-8000-000000000020', 'Synthetic lunch', 'VND', 0,
  '[{"id":"97049000-0000-4000-8000-000000000021","member_id":"97049000-0000-4000-8000-000000000001","display_name":"Recipient"},
    {"id":"97049000-0000-4000-8000-000000000022","member_id":"97049000-0000-4000-8000-000000000002","display_name":"Sender"}]',
  '{"direct":[]}',
  '{"balances":[{"participantId":"97049000-0000-4000-8000-000000000021","amountMinor":10},{"participantId":"97049000-0000-4000-8000-000000000022","amountMinor":-10}],"settlement":{"transfers":[{"from":"97049000-0000-4000-8000-000000000022","to":"97049000-0000-4000-8000-000000000021","amountMinor":10}]}}',
  true
);

select isnt(private.schedule_finance_bill_split_reminder(
  '97049000-0000-4000-8000-000000000010','97049000-0000-4000-8000-000000000001',
  '97049000-0000-4000-8000-000000000020','97049000-0000-4000-8000-000000000022'
), null::uuid, 'The split owner can schedule a bounded reminder for a debtor');

select private.create_finance_bill_split(
  '97049000-0000-4000-8000-000000000010', '97049000-0000-4000-8000-000000000001',
  '97049000-0000-4000-8000-000000000040', 'Synthetic dinner', 'VND', 0,
  '[{"id":"97049000-0000-4000-8000-000000000021","member_id":"97049000-0000-4000-8000-000000000001","display_name":"Recipient"},
    {"id":"97049000-0000-4000-8000-000000000022","member_id":"97049000-0000-4000-8000-000000000002","display_name":"Sender"}]',
  '{"direct":[]}',
  '{"settlement":{"transfers":[{"from":"97049000-0000-4000-8000-000000000022","to":"97049000-0000-4000-8000-000000000021","amountMinor":7}]}}',
  true
);
select private.schedule_finance_bill_split_reminder(
  '97049000-0000-4000-8000-000000000010','97049000-0000-4000-8000-000000000001',
  '97049000-0000-4000-8000-000000000040','97049000-0000-4000-8000-000000000022'
);
update private.finance_bill_split_reminders
set due_at = now()
where split_id = '97049000-0000-4000-8000-000000000040';

select is(private.dispatch_finance_bill_split_reminders(20), '{"canceled":0,"delivered":1}'::jsonb,
  'A valid, unsettled reminder is delivered once');
select is((select action_url from public.notifications
  where entity_id = '97049000-0000-4000-8000-000000000040'
    and user_id = '97049000-0000-4000-8000-000000000002'),
  '/97049000-0000-4000-8000-000000000010/finance/bill-splits/97049000-0000-4000-8000-000000000040/settlement',
  'The intended recipient gets the signed-in settlement link');

select is(private.report_finance_bill_split_with_proof(
  '97049000-0000-4000-8000-000000000010','97049000-0000-4000-8000-000000000002',
  '97049000-0000-4000-8000-000000000020','97049000-0000-4000-8000-000000000030',
  '97049000-0000-4000-8000-000000000022','97049000-0000-4000-8000-000000000021',
  4, 'image/png', 'iVBORw0KGgo='
), '97049000-0000-4000-8000-000000000030'::uuid, 'A sender can report a partial payment with proof');

select is(private.finance_bill_split_confirmed_payments(
  '97049000-0000-4000-8000-000000000010','97049000-0000-4000-8000-000000000001',
  '97049000-0000-4000-8000-000000000020'
), '[]'::jsonb, 'An unconfirmed report has no monetary effect');

select is(private.read_finance_bill_split_proof(
  '97049000-0000-4000-8000-000000000010','97049000-0000-4000-8000-000000000001',
  '97049000-0000-4000-8000-000000000020','97049000-0000-4000-8000-000000000030'
)->>'base64', 'iVBORw0KGgo=', 'The recipient may open the private proof');

select is(private.read_finance_bill_split_proof(
  '97049000-0000-4000-8000-000000000010','97049000-0000-4000-8000-000000000003',
  '97049000-0000-4000-8000-000000000020','97049000-0000-4000-8000-000000000030'
), null::jsonb, 'An unrelated member cannot access proof');

select is(private.write_finance_bill_split_activity(
  '97049000-0000-4000-8000-000000000010','97049000-0000-4000-8000-000000000001',
  '97049000-0000-4000-8000-000000000020','97049000-0000-4000-8000-000000000031',
  'payment_confirm', p_report_id => '97049000-0000-4000-8000-000000000030'
), '97049000-0000-4000-8000-000000000031'::uuid, 'The intended recipient can confirm a report');

select is(private.finance_bill_split_confirmed_payments(
  '97049000-0000-4000-8000-000000000010','97049000-0000-4000-8000-000000000001',
  '97049000-0000-4000-8000-000000000020'
)->0->>'amountMinor', '4', 'Only the confirmed partial amount affects settlement');

update private.finance_bill_split_reminders set due_at = now()
where ws_id = '97049000-0000-4000-8000-000000000010';
select is(private.dispatch_finance_bill_split_reminders(20),
  '{"canceled":1,"delivered":0}'::jsonb, 'Confirmation closes a stale reminder without sending');

create function pg_temp.fixture(n text) returns uuid language sql immutable
as $$ select ('97049000-0000-4000-8000-0000000000' || n)::uuid $$;

select private.create_finance_bill_split(
  pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('35'), 'Large valid settlement', 'VND', 0,
  '[{"id":"97049000-0000-4000-8000-000000000021","member_id":"97049000-0000-4000-8000-000000000001","display_name":"Recipient"},
    {"id":"97049000-0000-4000-8000-000000000022","member_id":"97049000-0000-4000-8000-000000000002","display_name":"Sender"}]',
  '{"direct":[]}',
  '{"balances":[{"participantId":"97049000-0000-4000-8000-000000000021","amountMinor":9007199254740991},
    {"participantId":"97049000-0000-4000-8000-000000000022","amountMinor":-9007199254740991}],
    "settlement":{"transfers":[{"from":"97049000-0000-4000-8000-000000000022","to":"97049000-0000-4000-8000-000000000021","amountMinor":9007199254740991}]}}',
  true
);
select private.manage_finance_bill_split_link(
  pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('35'), repeat('a',64), 1
);
select private.write_finance_bill_split_activity(
  pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('35'), pg_temp.fixture('36'),
  'payment_report', p_from_id => pg_temp.fixture('21'), p_to_id => pg_temp.fixture('22'),
  p_amount_minor => 1
);
select throws_ok($$
  select private.write_finance_bill_split_activity(
    pg_temp.fixture('10'), pg_temp.fixture('02'), pg_temp.fixture('35'), pg_temp.fixture('37'),
    'payment_confirm', p_report_id => pg_temp.fixture('36')
  )
$$, 'PT409', 'Confirmation exceeds the supported settlement bounds',
  'Confirmation rejects a small report that would overflow a valid ledger');
select ok(
  private.read_finance_bill_splits(pg_temp.fixture('10'), pg_temp.fixture('02'), pg_temp.fixture('35'))
    ->0->'ledger'->'settlement'->'transfers'->0->>'amountMinor' = '9007199254740991'
  and private.finance_bill_split_confirmed_payments(
    pg_temp.fixture('10'), pg_temp.fixture('02'), pg_temp.fixture('35')
  ) = '[]'::jsonb,
  'The signed-in view retains its valid snapshot and payments after rejection'
);
select ok(
  private.lookup_finance_bill_split_link(repeat('a',64))->>'splitId' = pg_temp.fixture('35')::text
  and private.finance_bill_split_confirmed_payments(
    pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('35')
  ) = '[]'::jsonb,
  'The public link still resolves and reads the valid settlement after rejection'
);

insert into public.workspace_users (id, ws_id, display_name)
values (pg_temp.fixture('50'), pg_temp.fixture('10'), 'Fixture contact');
insert into public.workspace_user_linked_users (ws_id, virtual_user_id, platform_user_id)
values (pg_temp.fixture('10'), pg_temp.fixture('50'), pg_temp.fixture('01'))
on conflict (platform_user_id, ws_id) do update
  set virtual_user_id = excluded.virtual_user_id;

select private.create_finance_bill_split(
  pg_temp.fixture('10'), pg_temp.fixture('02'), pg_temp.fixture('51'), 'Contact fixture', 'VND', 0,
  jsonb_build_array(jsonb_build_object('id', pg_temp.fixture('52'), 'contact_id', pg_temp.fixture('50'),
    'display_name', 'Fixture contact')), '{"direct":[]}', '{}', true
);
select is(private.read_finance_bill_splits(
  pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('51')
), '[]'::jsonb, 'Legacy mapping cannot read a contact split');
select ok(not private.finance_bill_split_participant_actor(
  pg_temp.fixture('10'), pg_temp.fixture('51'), pg_temp.fixture('52'), pg_temp.fixture('01')
), 'Legacy mapping cannot act as the contact participant');
select throws_ok($$
  select private.finance_contact_bank_command(
    pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('50'), 'consent',
    'Test bank', '123456', '1234', repeat('a', 40)
  )
$$, '42501', 'Account holder consent required', 'Legacy mapping cannot grant bank consent');

insert into private.contact_account_link_audit
  (ws_id, contact_id, actor_id, invitation_id, account_id, outcome)
values (pg_temp.fixture('10'), pg_temp.fixture('50'), pg_temp.fixture('01'),
  pg_temp.fixture('53'), pg_temp.fixture('01'), 'linked');
select ok(private.finance_bill_split_participant_actor(
  pg_temp.fixture('10'), pg_temp.fixture('51'), pg_temp.fixture('52'), pg_temp.fixture('01')
), 'Verified mapping grants contact participant authority');

select private.create_finance_bill_split(
  pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('54'), 'QR fixture', 'VND', 0,
  jsonb_build_array(jsonb_build_object('id', pg_temp.fixture('55'), 'contact_id', pg_temp.fixture('50'),
    'display_name', 'Fixture contact')), '{"direct":[]}', '{}', true
);
select private.finance_contact_bank_command(
  pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('50'), 'consent',
  'Test bank', '123456', '1234', repeat('a', 40)
);
select private.manage_finance_bill_split_link(
  pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('54'), repeat('b',64), 1,
  p_receiving_participant_id => pg_temp.fixture('55')
);
create temp table fixture_consent as
select (private.lookup_finance_bill_split_link(repeat('b',64))->>'receivingConsentRevision')::uuid as id;
select is(private.finance_contact_bank_command(
  pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('50'), 'public_qr',
  p_consent_revision => (select id from fixture_consent)
)->>'encryptedDetails', repeat('a',40), 'Explicit QR grant resolves its original consent revision');

select private.finance_contact_bank_command(
  pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('50'), 'consent',
  'Test bank', '123456', '4321', repeat('b', 40)
);
select is(private.lookup_finance_bill_split_link(repeat('b',64)), null::jsonb,
  'Replacing bank details invalidates the original link');
select is(private.finance_contact_bank_command(
  pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('50'), 'public_qr',
  p_consent_revision => (select id from fixture_consent)
), null::jsonb, 'A stale grant cannot read replacement bank details');
select private.manage_finance_bill_split_link(
  pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('54'), repeat('c',64), 1,
  p_receiving_participant_id => pg_temp.fixture('55')
);
select private.finance_contact_bank_command(
  pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('50'), 'revoke'
);
select private.finance_contact_bank_command(
  pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('50'), 'consent',
  'Test bank', '123456', '4321', repeat('b', 40)
);
select is(private.lookup_finance_bill_split_link(repeat('c',64)), null::jsonb,
  'Withdrawal remains effective after the holder saves another account');
select is(private.finance_contact_bank_command(
  pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('50'), 'public_qr'
), null::jsonb, 'Disclosure requires a new explicit QR link after saving the account');

-- Existing reminder rows count across splits while they are inside the quota window.
select private.create_finance_bill_split(
  pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('60'), 'Quota fixture', 'VND', 0,
  '[{"id":"97049000-0000-4000-8000-000000000021","member_id":"97049000-0000-4000-8000-000000000001","display_name":"Recipient"},
    {"id":"97049000-0000-4000-8000-000000000022","member_id":"97049000-0000-4000-8000-000000000002","display_name":"Sender"}]',
  '{"direct":[]}',
  '{"settlement":{"transfers":[{"from":"97049000-0000-4000-8000-000000000022","to":"97049000-0000-4000-8000-000000000021","amountMinor":7}]}}',
  true
);
select private.schedule_finance_bill_split_reminder(
  pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('60'), pg_temp.fixture('22')
);
delete from private.finance_bill_split_reminders where split_id = pg_temp.fixture('60');
insert into private.finance_bill_split_reminders
  (ws_id, split_id, participant_id, actor_id, recipient_id, due_at, payment_fence)
values (pg_temp.fixture('10'), pg_temp.fixture('40'), pg_temp.fixture('22'), pg_temp.fixture('01'),
  pg_temp.fixture('02'), now() + interval '48 hours', 1);
select throws_ok($$
  select private.schedule_finance_bill_split_reminder(
    pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('60'), pg_temp.fixture('22')
  )
$$, 'PT429', 'Reminder quota reached', 'Recipient quota applies across splits');

update private.finance_bill_split_reminders set created_at = now() - interval '25 hours'
where ws_id = pg_temp.fixture('10');
select isnt(private.schedule_finance_bill_split_reminder(
  pg_temp.fixture('10'), pg_temp.fixture('01'), pg_temp.fixture('60'), pg_temp.fixture('22')
), null::uuid, 'Expired quota entries no longer block scheduling');

update public.workspace_default_permissions set enabled = false
where ws_id = pg_temp.fixture('10') and permission = 'view_transactions';
update private.finance_bill_split_reminders set due_at = now()
where split_id = pg_temp.fixture('60');
select is(private.dispatch_finance_bill_split_reminders(20), '{"canceled":1,"delivered":0}'::jsonb,
  'Delivery rechecks the recipient Finance permission');

select * from finish();

rollback;
