begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

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
    'private.finance_contact_bank_command(uuid,uuid,uuid,text,text,text,text,text)', 'execute'),
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

select private.create_finance_bill_split(
  '97049000-0000-4000-8000-000000000010', '97049000-0000-4000-8000-000000000001',
  '97049000-0000-4000-8000-000000000020', 'Synthetic lunch', 'VND', 0,
  '[{"id":"97049000-0000-4000-8000-000000000021","member_id":"97049000-0000-4000-8000-000000000001","display_name":"Recipient"},
    {"id":"97049000-0000-4000-8000-000000000022","member_id":"97049000-0000-4000-8000-000000000002","display_name":"Sender"}]',
  '{"direct":[]}',
  '{"settlement":{"transfers":[{"from":"97049000-0000-4000-8000-000000000022","to":"97049000-0000-4000-8000-000000000021","amountMinor":10}]}}',
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

select * from finish();

rollback;
