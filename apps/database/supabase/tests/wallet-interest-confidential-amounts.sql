begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(23);

select ok(
  to_regprocedure('private.get_wallet_interest_visible_balance(uuid,boolean)') is not null,
  'private visible wallet balance helper exists'
);

select ok(
  to_regprocedure(
    'private.wallet_interest_calculation_result(uuid,uuid,date,date,date,date,numeric)'
  ) is null,
  'old wallet interest calculation helper signature is removed'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('private.get_wallet_interest_visible_balance(uuid,boolean)'),
        ('private.get_wallet_interest_initial_balance(uuid,uuid,uuid,date)'),
        ('private.wallet_interest_calculation_result(uuid,uuid,date,date,date,date,numeric,boolean)'),
        ('private.get_wallet_interest_summary(uuid,uuid,uuid)'),
        ('private.get_wallet_interest_projection(uuid,uuid,uuid,date,integer)'),
        ('private.calculate_wallet_interest(uuid,uuid,uuid,date,date)'),
        ('private.detect_wallet_interest_transactions(uuid,uuid,uuid)')
    ) as functions(signature)
    where not has_function_privilege('service_role', functions.signature, 'execute')
  ),
  'service role can execute private wallet interest RPCs'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('private.get_wallet_interest_visible_balance(uuid,boolean)'),
        ('private.get_wallet_interest_initial_balance(uuid,uuid,uuid,date)'),
        ('private.wallet_interest_calculation_result(uuid,uuid,date,date,date,date,numeric,boolean)'),
        ('private.get_wallet_interest_summary(uuid,uuid,uuid)'),
        ('private.get_wallet_interest_projection(uuid,uuid,uuid,date,integer)'),
        ('private.calculate_wallet_interest(uuid,uuid,uuid,date,date)'),
        ('private.detect_wallet_interest_transactions(uuid,uuid,uuid)')
    ) as functions(signature)
    where has_function_privilege('authenticated', functions.signature, 'execute')
      or has_function_privilege('anon', functions.signature, 'execute')
  ),
  'anon and authenticated cannot execute private wallet interest RPCs directly'
);

select ok(
  pg_get_functiondef('private.calculate_wallet_interest(uuid,uuid,uuid,date,date)'::regprocedure)
    like '%view_confidential_amount%'
    and pg_get_functiondef('private.get_wallet_interest_summary(uuid,uuid,uuid)'::regprocedure)
      like '%view_confidential_amount%'
    and pg_get_functiondef('private.get_wallet_interest_projection(uuid,uuid,uuid,date,integer)'::regprocedure)
      like '%view_confidential_amount%'
    and pg_get_functiondef('private.detect_wallet_interest_transactions(uuid,uuid,uuid)'::regprocedure)
      like '%view_confidential_amount%',
  'wallet interest RPCs check confidential amount permission'
);

select ok(
  pg_get_functiondef('private.calculate_wallet_interest(uuid,uuid,uuid,date,date)'::regprocedure)
    like '%is_amount_confidential%'
    and pg_get_functiondef('private.get_wallet_interest_summary(uuid,uuid,uuid)'::regprocedure)
      like '%is_amount_confidential%'
    and pg_get_functiondef('private.get_wallet_interest_projection(uuid,uuid,uuid,date,integer)'::regprocedure)
      like '%get_wallet_interest_visible_balance%'
    and pg_get_functiondef('private.detect_wallet_interest_transactions(uuid,uuid,uuid)'::regprocedure)
      like '%is_amount_confidential%',
  'wallet interest RPCs apply confidential amount redaction'
);

insert into public.users (id)
values
  ('10000000-0000-0000-0000-000000000901'),
  ('10000000-0000-0000-0000-000000000902'),
  ('10000000-0000-0000-0000-000000000903')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '10000000-0000-0000-0000-000000000910',
  'Wallet Interest Confidential Test',
  false,
  '10000000-0000-0000-0000-000000000901'
)
on conflict (id) do nothing;

update public.workspace_default_permissions
set enabled = false
where ws_id = '10000000-0000-0000-0000-000000000910';

insert into public.workspace_members (ws_id, user_id, type)
values
  (
    '10000000-0000-0000-0000-000000000910',
    '10000000-0000-0000-0000-000000000902',
    'MEMBER'
  ),
  (
    '10000000-0000-0000-0000-000000000910',
    '10000000-0000-0000-0000-000000000903',
    'MEMBER'
  )
on conflict (ws_id, user_id) do update
set type = excluded.type;

insert into public.workspace_roles (id, ws_id, name)
values
  (
    '10000000-0000-0000-0000-000000000911',
    '10000000-0000-0000-0000-000000000910',
    'Wallet interest reader'
  ),
  (
    '10000000-0000-0000-0000-000000000912',
    '10000000-0000-0000-0000-000000000910',
    'Wallet interest confidential reader'
  )
on conflict (id) do nothing;

insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values
  (
    '10000000-0000-0000-0000-000000000910',
    '10000000-0000-0000-0000-000000000911',
    'view_transactions',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000910',
    '10000000-0000-0000-0000-000000000912',
    'view_transactions',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000910',
    '10000000-0000-0000-0000-000000000912',
    'view_confidential_amount',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000910',
    '10000000-0000-0000-0000-000000000912',
    'view_confidential_description',
    true
  )
on conflict (ws_id, permission, role_id) do update
set enabled = excluded.enabled;

insert into public.workspace_role_members (role_id, user_id)
values
  (
    '10000000-0000-0000-0000-000000000911',
    '10000000-0000-0000-0000-000000000902'
  ),
  (
    '10000000-0000-0000-0000-000000000912',
    '10000000-0000-0000-0000-000000000903'
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
  '10000000-0000-0000-0000-000000000913',
  '10000000-0000-0000-0000-000000000910',
  'Wallet interest confidential source',
  'STANDARD',
  'VND'
);

insert into public.workspace_role_wallet_whitelist (role_id, wallet_id)
values
  (
    '10000000-0000-0000-0000-000000000911',
    '10000000-0000-0000-0000-000000000913'
  ),
  (
    '10000000-0000-0000-0000-000000000912',
    '10000000-0000-0000-0000-000000000913'
  )
on conflict (role_id, wallet_id) do nothing;

insert into public.wallet_interest_configs (
  id,
  wallet_id,
  provider,
  enabled,
  total_interest_earned,
  last_interest_amount,
  tracking_start_date
) values (
  '10000000-0000-0000-0000-000000000914',
  '10000000-0000-0000-0000-000000000913',
  'momo',
  true,
  7777,
  333,
  current_date - 3
);

insert into public.wallet_interest_rates (
  id,
  config_id,
  annual_rate,
  effective_from
) values (
  '10000000-0000-0000-0000-000000000915',
  '10000000-0000-0000-0000-000000000914',
  36.5,
  current_date - 3
);

insert into public.wallet_transactions (
  id,
  wallet_id,
  amount,
  description,
  created_at,
  is_amount_confidential,
  is_description_confidential
) values
  (
    '10000000-0000-0000-0000-000000000916',
    '10000000-0000-0000-0000-000000000913',
    1000,
    'daily interest visible',
    (current_date - 1 + time '09:00')::timestamp with time zone,
    false,
    false
  ),
  (
    '10000000-0000-0000-0000-000000000917',
    '10000000-0000-0000-0000-000000000913',
    9000,
    'daily interest confidential',
    (current_date - 1 + time '10:00')::timestamp with time zone,
    true,
    true
  );

create temporary table wallet_interest_confidential_results as
select
  private.get_wallet_interest_initial_balance(
    '10000000-0000-0000-0000-000000000910',
    '10000000-0000-0000-0000-000000000913',
    '10000000-0000-0000-0000-000000000902',
    current_date
  ) as low_initial_balance,
  private.get_wallet_interest_initial_balance(
    '10000000-0000-0000-0000-000000000910',
    '10000000-0000-0000-0000-000000000913',
    '10000000-0000-0000-0000-000000000903',
    current_date
  ) as high_initial_balance,
  private.get_wallet_interest_projection(
    '10000000-0000-0000-0000-000000000910',
    '10000000-0000-0000-0000-000000000913',
    '10000000-0000-0000-0000-000000000902',
    current_date,
    1
  ) as low_projection,
  private.get_wallet_interest_projection(
    '10000000-0000-0000-0000-000000000910',
    '10000000-0000-0000-0000-000000000913',
    '10000000-0000-0000-0000-000000000903',
    current_date,
    1
  ) as high_projection,
  private.calculate_wallet_interest(
    '10000000-0000-0000-0000-000000000910',
    '10000000-0000-0000-0000-000000000913',
    '10000000-0000-0000-0000-000000000902',
    current_date,
    current_date
  ) as low_calculation,
  private.calculate_wallet_interest(
    '10000000-0000-0000-0000-000000000910',
    '10000000-0000-0000-0000-000000000913',
    '10000000-0000-0000-0000-000000000903',
    current_date,
    current_date
  ) as high_calculation,
  private.get_wallet_interest_summary(
    '10000000-0000-0000-0000-000000000910',
    '10000000-0000-0000-0000-000000000913',
    '10000000-0000-0000-0000-000000000902'
  ) as low_summary,
  private.get_wallet_interest_summary(
    '10000000-0000-0000-0000-000000000910',
    '10000000-0000-0000-0000-000000000913',
    '10000000-0000-0000-0000-000000000903'
  ) as high_summary,
  private.detect_wallet_interest_transactions(
    '10000000-0000-0000-0000-000000000910',
    '10000000-0000-0000-0000-000000000913',
    '10000000-0000-0000-0000-000000000902'
  ) as low_detection,
  private.detect_wallet_interest_transactions(
    '10000000-0000-0000-0000-000000000910',
    '10000000-0000-0000-0000-000000000913',
    '10000000-0000-0000-0000-000000000903'
  ) as high_detection;

reset role;

select is(
  (select low_initial_balance from wallet_interest_confidential_results),
  1000::numeric,
  'initial balance excludes confidential amounts without permission'
);

select is(
  (select high_initial_balance from wallet_interest_confidential_results),
  10000::numeric,
  'initial balance includes confidential amounts with permission'
);

select is(
  (select (low_projection ->> 'currentBalance')::numeric from wallet_interest_confidential_results),
  1000::numeric,
  'projection current balance excludes confidential amounts without permission'
);

select is(
  (select (high_projection ->> 'currentBalance')::numeric from wallet_interest_confidential_results),
  10000::numeric,
  'projection current balance includes confidential amounts with permission'
);

select is(
  (select (low_calculation ->> 'initialBalance')::numeric from wallet_interest_confidential_results),
  1000::numeric,
  'date-range calculation initial balance excludes confidential amounts without permission'
);

select is(
  (select (high_calculation ->> 'initialBalance')::numeric from wallet_interest_confidential_results),
  10000::numeric,
  'date-range calculation initial balance includes confidential amounts with permission'
);

select is(
  (select (low_calculation -> 'dailyResults' -> 0 ->> 'balance')::numeric from wallet_interest_confidential_results),
  1000::numeric,
  'daily calculation balance excludes confidential amounts without permission'
);

select is(
  (select (high_calculation -> 'dailyResults' -> 0 ->> 'balance')::numeric from wallet_interest_confidential_results),
  10000::numeric,
  'daily calculation balance includes confidential amounts with permission'
);

select is(
  (select (low_summary -> 'config' ->> 'total_interest_earned')::numeric from wallet_interest_confidential_results),
  0::numeric,
  'summary config total interest is redacted without confidential amount permission'
);

select is(
  (select (high_summary -> 'config' ->> 'total_interest_earned')::numeric from wallet_interest_confidential_results),
  7777::numeric,
  'summary config total interest is visible with confidential amount permission'
);

select isnt(
  (select (low_summary ->> 'totalEarnedInterest')::numeric from wallet_interest_confidential_results),
  7777::numeric,
  'summary top-level total earned interest does not leak configured confidential total'
);

select is(
  (select (high_summary ->> 'totalEarnedInterest')::numeric from wallet_interest_confidential_results),
  7777::numeric,
  'summary top-level total earned interest is visible with confidential amount permission'
);

select is(
  (select (low_detection ->> 'totalAmount')::numeric from wallet_interest_confidential_results),
  1000::numeric,
  'interest detection excludes confidential detected amounts without permission'
);

select is(
  (select (high_detection ->> 'totalAmount')::numeric from wallet_interest_confidential_results),
  10000::numeric,
  'interest detection includes confidential detected amounts with permission'
);

select is(
  (select jsonb_array_length(low_detection -> 'detected') from wallet_interest_confidential_results),
  1,
  'interest detection hides confidential detected rows without permission'
);

select is(
  (select jsonb_array_length(high_detection -> 'detected') from wallet_interest_confidential_results),
  2,
  'interest detection includes confidential detected rows with permission'
);

select is(
  (
    select low_detection -> 'detected' -> 0 ->> 'description'
    from wallet_interest_confidential_results
  ),
  'daily interest visible',
  'interest detection still returns visible descriptions for visible rows'
);

select * from finish();

rollback;
