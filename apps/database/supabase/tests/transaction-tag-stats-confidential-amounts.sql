begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(21);

select ok(
  to_regprocedure('private.get_transaction_tag_stats(uuid,uuid)') is not null,
  'private transaction tag stats RPC exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.get_transaction_tag_stats(uuid,uuid)',
    'execute'
  ),
  'service role can execute transaction tag stats RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.get_transaction_tag_stats(uuid,uuid)',
    'execute'
  ),
  'authenticated users cannot execute transaction tag stats RPC directly'
);

select ok(
  pg_get_functiondef(
    'private.get_transaction_tag_stats(uuid,uuid)'::regprocedure
  ) like '%view_confidential_amount%',
  'transaction tag stats RPC checks confidential amount permission'
);

select ok(
  pg_get_functiondef(
    'private.get_transaction_tag_stats(uuid,uuid)'::regprocedure
  ) like '%is_amount_confidential%'
    and pg_get_functiondef(
      'private.get_transaction_tag_stats(uuid,uuid)'::regprocedure
    ) like '%private.workspace_wallets%',
  'transaction tag stats RPC applies confidential amount redaction through private wallets'
);

insert into public.users (id)
values
  ('10000000-0000-0000-0000-000000000951'),
  ('10000000-0000-0000-0000-000000000952'),
  ('10000000-0000-0000-0000-000000000953')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '10000000-0000-0000-0000-000000000954',
  'Transaction Tag Stats Confidential Test',
  false,
  '10000000-0000-0000-0000-000000000951'
)
on conflict (id) do nothing;

update public.workspace_default_permissions
set enabled = false
where ws_id = '10000000-0000-0000-0000-000000000954';

insert into public.workspace_members (ws_id, user_id, type)
values
  (
    '10000000-0000-0000-0000-000000000954',
    '10000000-0000-0000-0000-000000000952',
    'MEMBER'
  ),
  (
    '10000000-0000-0000-0000-000000000954',
    '10000000-0000-0000-0000-000000000953',
    'MEMBER'
  )
on conflict (ws_id, user_id) do update
set type = excluded.type;

insert into public.workspace_roles (id, ws_id, name)
values
  (
    '10000000-0000-0000-0000-000000000955',
    '10000000-0000-0000-0000-000000000954',
    'Tag stats finance manager'
  ),
  (
    '10000000-0000-0000-0000-000000000956',
    '10000000-0000-0000-0000-000000000954',
    'Tag stats confidential finance manager'
  )
on conflict (id) do nothing;

insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values
  (
    '10000000-0000-0000-0000-000000000954',
    '10000000-0000-0000-0000-000000000955',
    'manage_finance',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000954',
    '10000000-0000-0000-0000-000000000956',
    'manage_finance',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000954',
    '10000000-0000-0000-0000-000000000956',
    'view_confidential_amount',
    true
  )
on conflict (ws_id, permission, role_id) do update
set enabled = excluded.enabled;

insert into public.workspace_role_members (role_id, user_id)
values
  (
    '10000000-0000-0000-0000-000000000955',
    '10000000-0000-0000-0000-000000000952'
  ),
  (
    '10000000-0000-0000-0000-000000000956',
    '10000000-0000-0000-0000-000000000953'
  )
on conflict (role_id, user_id) do nothing;

set local role service_role;

insert into private.workspace_wallets (
  id,
  ws_id,
  name,
  type,
  currency
) values (
  '10000000-0000-0000-0000-000000000957',
  '10000000-0000-0000-0000-000000000954',
  'Transaction tag stats confidential wallet',
  'STANDARD',
  'VND'
);

insert into public.transaction_tags (
  id,
  ws_id,
  name,
  color,
  description
) values (
  '10000000-0000-0000-0000-000000000958',
  '10000000-0000-0000-0000-000000000954',
  'Sensitive aggregate tag',
  '#ec4899',
  'tag used by confidential amount pgTAP'
);

insert into public.wallet_transactions (
  id,
  wallet_id,
  amount,
  description,
  taken_at,
  is_amount_confidential
) values
  (
    '10000000-0000-0000-0000-000000000959',
    '10000000-0000-0000-0000-000000000957',
    100,
    'visible income',
    now() - interval '1 day',
    false
  ),
  (
    '10000000-0000-0000-0000-000000000960',
    '10000000-0000-0000-0000-000000000957',
    -40,
    'visible expense',
    now() - interval '1 day',
    false
  ),
  (
    '10000000-0000-0000-0000-000000000961',
    '10000000-0000-0000-0000-000000000957',
    900,
    'confidential income',
    now() - interval '1 day',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000962',
    '10000000-0000-0000-0000-000000000957',
    -500,
    'confidential expense',
    now() - interval '1 day',
    true
  );

insert into public.wallet_transaction_tags (transaction_id, tag_id)
values
  (
    '10000000-0000-0000-0000-000000000959',
    '10000000-0000-0000-0000-000000000958'
  ),
  (
    '10000000-0000-0000-0000-000000000960',
    '10000000-0000-0000-0000-000000000958'
  ),
  (
    '10000000-0000-0000-0000-000000000961',
    '10000000-0000-0000-0000-000000000958'
  ),
  (
    '10000000-0000-0000-0000-000000000962',
    '10000000-0000-0000-0000-000000000958'
  );

create temporary table low_transaction_tag_stats as
select *
from private.get_transaction_tag_stats(
  '10000000-0000-0000-0000-000000000954',
  '10000000-0000-0000-0000-000000000952'
)
where tag_id = '10000000-0000-0000-0000-000000000958';

create temporary table high_transaction_tag_stats as
select *
from private.get_transaction_tag_stats(
  '10000000-0000-0000-0000-000000000954',
  '10000000-0000-0000-0000-000000000953'
)
where tag_id = '10000000-0000-0000-0000-000000000958';

reset role;

select is(
  (select transaction_count from low_transaction_tag_stats),
  4::bigint,
  'tag activity count still includes confidential transactions'
);

select is(
  (select income_count from low_transaction_tag_stats),
  1::bigint,
  'income count excludes confidential income without permission'
);

select is(
  (select expense_count from low_transaction_tag_stats),
  1::bigint,
  'expense count excludes confidential expense without permission'
);

select is(
  (select total_amount from low_transaction_tag_stats),
  140::double precision,
  'total amount excludes confidential amounts without permission'
);

select is(
  (select total_income from low_transaction_tag_stats),
  100::double precision,
  'total income excludes confidential income without permission'
);

select is(
  (select total_expense from low_transaction_tag_stats),
  40::double precision,
  'total expense excludes confidential expense without permission'
);

select is(
  (select net_total from low_transaction_tag_stats),
  60::double precision,
  'net total excludes confidential amounts without permission'
);

select is(
  (select recent_total_income from low_transaction_tag_stats),
  100::double precision,
  'recent total income excludes confidential income without permission'
);

select is(
  (select recent_total_expense from low_transaction_tag_stats),
  40::double precision,
  'recent total expense excludes confidential expense without permission'
);

select is(
  (select income_count from high_transaction_tag_stats),
  2::bigint,
  'income count includes confidential income with permission'
);

select is(
  (select expense_count from high_transaction_tag_stats),
  2::bigint,
  'expense count includes confidential expense with permission'
);

select is(
  (select total_amount from high_transaction_tag_stats),
  1540::double precision,
  'total amount includes confidential amounts with permission'
);

select is(
  (select total_income from high_transaction_tag_stats),
  1000::double precision,
  'total income includes confidential income with permission'
);

select is(
  (select total_expense from high_transaction_tag_stats),
  540::double precision,
  'total expense includes confidential expense with permission'
);

select is(
  (select net_total from high_transaction_tag_stats),
  460::double precision,
  'net total includes confidential amounts with permission'
);

select is(
  (select recent_total_income from high_transaction_tag_stats),
  1000::double precision,
  'recent total income includes confidential income with permission'
);

select * from finish();

rollback;
