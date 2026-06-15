begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(12);

select ok(
  to_regprocedure('public.get_transaction_list_enrichment(uuid,uuid[],uuid)') is not null,
  'transaction list enrichment RPC exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_transaction_list_enrichment(uuid,uuid[],uuid)',
    'execute'
  ),
  'authenticated can execute guarded transaction list enrichment RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.get_transaction_list_enrichment(uuid,uuid[],uuid)',
    'execute'
  ),
  'service_role can execute transaction list enrichment for app-session routes'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_transaction_list_enrichment(uuid,uuid[],uuid)',
    'execute'
  ),
  'anon cannot execute transaction list enrichment RPC directly'
);

select ok(
  position(
    'auth.role()' in lower(pg_get_functiondef(
      'public.get_transaction_list_enrichment(uuid,uuid[],uuid)'::regprocedure
    ))
  ) > 0,
  'transaction list enrichment distinguishes service-role null-auth calls'
);

insert into public.users (id)
values
  ('10000000-0000-0000-0000-000000001001'),
  ('10000000-0000-0000-0000-000000001002'),
  ('10000000-0000-0000-0000-000000001003')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '10000000-0000-0000-0000-000000001010',
  'Transaction List Enrichment App Session Test',
  false,
  '10000000-0000-0000-0000-000000001001'
)
on conflict (id) do nothing;

update public.workspace_default_permissions
set enabled = false
where ws_id = '10000000-0000-0000-0000-000000001010';

insert into public.workspace_members (ws_id, user_id, type)
values (
  '10000000-0000-0000-0000-000000001010',
  '10000000-0000-0000-0000-000000001002',
  'MEMBER'
)
on conflict (ws_id, user_id) do update
set type = excluded.type;

insert into public.workspace_roles (id, ws_id, name)
values (
  '10000000-0000-0000-0000-000000001020',
  '10000000-0000-0000-0000-000000001010',
  'Transaction enrichment finance viewer'
)
on conflict (id) do nothing;

insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values (
  '10000000-0000-0000-0000-000000001010',
  '10000000-0000-0000-0000-000000001020',
  'view_transactions',
  true
)
on conflict (ws_id, permission, role_id) do update
set enabled = excluded.enabled;

insert into public.workspace_role_members (role_id, user_id)
values (
  '10000000-0000-0000-0000-000000001020',
  '10000000-0000-0000-0000-000000001002'
)
on conflict (role_id, user_id) do nothing;

set local role service_role;

select set_config('request.jwt.claims', '{"role":"service_role"}'::text, true);

select is(
  auth.uid(),
  null::uuid,
  'service-role app-session style call has no Postgres auth.uid'
);

insert into private.workspace_wallets (
  id,
  ws_id,
  name,
  type,
  currency
) values (
  '10000000-0000-0000-0000-000000001011',
  '10000000-0000-0000-0000-000000001010',
  'App-session enrichment wallet',
  'STANDARD',
  'VND'
) on conflict (id) do nothing;

insert into private.workspace_wallets (
  id,
  ws_id,
  name,
  type,
  currency
) values (
  '10000000-0000-0000-0000-000000001016',
  '10000000-0000-0000-0000-000000001010',
  'App-session enrichment destination wallet',
  'STANDARD',
  'VND'
) on conflict (id) do nothing;

insert into public.transaction_tags (
  id,
  ws_id,
  name,
  color,
  description
) values (
  '10000000-0000-0000-0000-000000001012',
  '10000000-0000-0000-0000-000000001010',
  'App-session enrichment tag',
  '#22c55e',
  'tag used by transaction enrichment app-session pgTAP'
) on conflict (id) do nothing;

insert into public.wallet_transactions (
  id,
  wallet_id,
  amount,
  description,
  taken_at
) values (
  '10000000-0000-0000-0000-000000001013',
  '10000000-0000-0000-0000-000000001011',
  125000,
  'app-session enrichment transaction',
  now()
) on conflict (id) do nothing;

insert into public.wallet_transactions (
  id,
  wallet_id,
  amount,
  description,
  taken_at,
  is_amount_confidential
) values (
  '10000000-0000-0000-0000-000000001014',
  '10000000-0000-0000-0000-000000001011',
  -50000,
  'confidential transfer origin',
  now(),
  true
) on conflict (id) do update
set is_amount_confidential = excluded.is_amount_confidential;

insert into public.wallet_transactions (
  id,
  wallet_id,
  amount,
  description,
  taken_at,
  is_amount_confidential
) values (
  '10000000-0000-0000-0000-000000001015',
  '10000000-0000-0000-0000-000000001016',
  50000,
  'non-confidential transfer destination',
  now(),
  false
) on conflict (id) do update
set is_amount_confidential = excluded.is_amount_confidential;

insert into public.workspace_wallet_transfers (
  from_transaction_id,
  to_transaction_id
) values (
  '10000000-0000-0000-0000-000000001014',
  '10000000-0000-0000-0000-000000001015'
) on conflict do nothing;

insert into public.wallet_transaction_tags (transaction_id, tag_id)
values (
  '10000000-0000-0000-0000-000000001013',
  '10000000-0000-0000-0000-000000001012'
) on conflict (transaction_id, tag_id) do nothing;

select is(
  (
    select count(*)::int
    from public.get_transaction_list_enrichment(
      '10000000-0000-0000-0000-000000001010',
      array['10000000-0000-0000-0000-000000001013']::uuid[],
      '10000000-0000-0000-0000-000000001002'
    )
  ),
  1,
  'explicit workspace member p_user_id can enrich transactions when auth.uid is null'
);

select is(
  (
    select wallet_currency
    from public.get_transaction_list_enrichment(
      '10000000-0000-0000-0000-000000001010',
      array['10000000-0000-0000-0000-000000001013']::uuid[],
      '10000000-0000-0000-0000-000000001002'
    )
  ),
  'VND',
  'enrichment returns wallet presentation data'
);

select is(
  (
    select tags->0->>'name'
    from public.get_transaction_list_enrichment(
      '10000000-0000-0000-0000-000000001010',
      array['10000000-0000-0000-0000-000000001013']::uuid[],
      '10000000-0000-0000-0000-000000001002'
    )
  ),
  'App-session enrichment tag',
  'enrichment returns transaction tags'
);

select is(
  (
    select count(*)::int
    from public.get_transaction_list_enrichment(
      '10000000-0000-0000-0000-000000001010',
      array['10000000-0000-0000-0000-000000001013']::uuid[],
      '10000000-0000-0000-0000-000000001003'
    )
  ),
  0,
  'explicit non-member p_user_id still returns no enrichment rows'
);

select is(
  (
    select transfer->>'linked_amount'
    from public.get_transaction_list_enrichment(
      '10000000-0000-0000-0000-000000001010',
      array['10000000-0000-0000-0000-000000001015']::uuid[],
      '10000000-0000-0000-0000-000000001002'
    )
  ),
  null,
  'linked transfer amount is redacted when linked leg is confidential'
);

select is(
  (
    select transfer->>'linked_amount_redacted'
    from public.get_transaction_list_enrichment(
      '10000000-0000-0000-0000-000000001010',
      array['10000000-0000-0000-0000-000000001015']::uuid[],
      '10000000-0000-0000-0000-000000001002'
    )
  ),
  'true',
  'linked transfer metadata marks the linked amount as redacted'
);

select * from finish();

rollback;
