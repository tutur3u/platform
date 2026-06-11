begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(8);

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
  position(
    'auth.uid() is not null' in lower(pg_get_functiondef(
      'public.get_transaction_list_enrichment(uuid,uuid[],uuid)'::regprocedure
    ))
  ) > 0,
  'transaction list enrichment only enforces cross-user guard when auth.uid is present'
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

insert into public.workspace_members (ws_id, user_id, type)
values (
  '10000000-0000-0000-0000-000000001010',
  '10000000-0000-0000-0000-000000001002',
  'MEMBER'
)
on conflict (ws_id, user_id) do update
set type = excluded.type;

set local role service_role;

select set_config('request.jwt.claims', '{}'::text, true);

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

select * from finish();

rollback;
