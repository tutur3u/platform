begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

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

select * from finish();

rollback;
