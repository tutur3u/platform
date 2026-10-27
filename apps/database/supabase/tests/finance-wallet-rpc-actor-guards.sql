begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(41);

create function pg_temp.fwag_id(n integer) returns uuid
language sql immutable
as $$ select ('00009032-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- User 1 creates workspace A; user 4 creates workspace B.
insert into auth.users (id) values (pg_temp.fwag_id(1)), (pg_temp.fwag_id(4))
on conflict (id) do nothing;
insert into public.users (id) values (pg_temp.fwag_id(1)), (pg_temp.fwag_id(4))
on conflict (id) do nothing;
insert into public.workspaces (id, name, personal, creator_id)
values
  (pg_temp.fwag_id(10), 'Wallet workspace', false, pg_temp.fwag_id(1)),
  (pg_temp.fwag_id(11), 'Other workspace', false, pg_temp.fwag_id(4));
insert into public.workspace_members (ws_id, user_id, type)
values
  (pg_temp.fwag_id(10), pg_temp.fwag_id(1), 'MEMBER'),
  (pg_temp.fwag_id(11), pg_temp.fwag_id(4), 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;
insert into private.workspace_wallets (id, ws_id, name)
values (pg_temp.fwag_id(20), pg_temp.fwag_id(10), 'Synthetic wallet');
insert into public.wallet_transactions (wallet_id, amount, taken_at)
values
  (pg_temp.fwag_id(20), 100, now() - interval '1 day'),
  (pg_temp.fwag_id(20), -40, now() - interval '1 day');

select is(
  (
    select count(*)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname in (
        'get_transactions_by_period', 'get_wallet_expense_count',
        'get_wallet_expense_sum', 'get_wallet_income_count',
        'get_wallet_income_sum', 'get_wallet_permission_context',
        'get_wallet_transactions_with_permissions',
        'get_workspace_wallets_expense', 'get_workspace_wallets_income'
      )
      and (
        has_function_privilege('anon', p.oid, 'execute')
        or coalesce(pg_catalog.array_to_string(p.proconfig, ','), '') <> 'search_path=pg_catalog, pg_temp'
      )
  ),
  0::bigint,
  'no wallet definer overload is anon-executable or left with an unpinned search_path'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname in (
        'get_transactions_by_period', 'get_wallet_expense_count',
        'get_wallet_expense_sum', 'get_wallet_income_count',
        'get_wallet_income_sum', 'get_wallet_permission_context',
        'get_wallet_transactions_with_permissions',
        'get_workspace_wallets_expense', 'get_workspace_wallets_income'
      )
      and pg_catalog.pg_get_functiondef(p.oid) ~ 'p_user_id != auth\.uid\(\)'
  ),
  0::bigint,
  'no wallet definer keeps the NULL-unsafe actor comparison'
);

select ok(
  not has_function_privilege('authenticated', 'public.get_wallet_income_sum(uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.get_workspace_wallets_income(uuid,timestamptz,timestamptz,boolean)', 'execute')
  and has_function_privilege('service_role', 'public.get_workspace_wallets_income(uuid,timestamptz,timestamptz,boolean)', 'execute'),
  'unguarded legacy overloads are service_role only'
);

-- anon: no EXECUTE on any hardened overload
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  format('select can_view_transactions from public.get_wallet_permission_context(%L::uuid, %L::uuid)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'anon cannot call get_wallet_permission_context'
);
select throws_ok(
  format('select public.get_wallet_income_sum(%L::uuid, %L::uuid, true)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'anon cannot call get_wallet_income_sum'
);
select throws_ok(
  format('select public.get_wallet_income_count(%L::uuid, %L::uuid, true)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'anon cannot call get_wallet_income_count'
);
select throws_ok(
  format('select public.get_wallet_expense_sum(%L::uuid, %L::uuid, true)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'anon cannot call get_wallet_expense_sum'
);
select throws_ok(
  format('select public.get_wallet_expense_count(%L::uuid, %L::uuid, true)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'anon cannot call get_wallet_expense_count'
);
select throws_ok(
  format('select public.get_workspace_wallets_income(ws_id => %L::uuid, p_user_id => %L::uuid, include_confidential => true)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'anon cannot call get_workspace_wallets_income'
);
select throws_ok(
  format('select public.get_workspace_wallets_expense(ws_id => %L::uuid, p_user_id => %L::uuid, include_confidential => true)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'anon cannot call get_workspace_wallets_expense'
);
select throws_ok(
  format('select count(*) from public.get_transactions_by_period(p_ws_id => %L::uuid, p_user_id => %L::uuid, p_interval => ''monthly'')', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'anon cannot call get_transactions_by_period'
);
select throws_ok(
  format('select count(*) from public.get_wallet_transactions_with_permissions(p_ws_id => %L::uuid, p_user_id => %L::uuid)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'anon cannot call get_wallet_transactions_with_permissions'
);
reset role;

-- authenticated without a subject claim acting as the workspace creator
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  format('select can_view_transactions from public.get_wallet_permission_context(%L::uuid, %L::uuid)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'authenticated caller without a user cannot call get_wallet_permission_context'
);
select throws_ok(
  format('select count(*) from public.get_wallet_transactions_with_permissions(p_ws_id => %L::uuid, p_user_id => %L::uuid)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'authenticated caller without a user cannot call get_wallet_transactions_with_permissions'
);
reset role;

-- other user (member of another workspace) naming the workspace creator
set local role authenticated;
select set_config('request.jwt.claims', format('{"role":"authenticated","sub":"%s"}', pg_temp.fwag_id(4)), true);
select throws_ok(
  format('select can_view_transactions from public.get_wallet_permission_context(%L::uuid, %L::uuid)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'other user cannot call get_wallet_permission_context as the workspace creator'
);
select throws_ok(
  format('select public.get_wallet_income_sum(%L::uuid, %L::uuid, true)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'other user cannot call get_wallet_income_sum as the workspace creator'
);
select throws_ok(
  format('select public.get_wallet_income_count(%L::uuid, %L::uuid, true)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'other user cannot call get_wallet_income_count as the workspace creator'
);
select throws_ok(
  format('select public.get_wallet_expense_sum(%L::uuid, %L::uuid, true)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'other user cannot call get_wallet_expense_sum as the workspace creator'
);
select throws_ok(
  format('select public.get_wallet_expense_count(%L::uuid, %L::uuid, true)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'other user cannot call get_wallet_expense_count as the workspace creator'
);
select throws_ok(
  format('select public.get_workspace_wallets_income(ws_id => %L::uuid, p_user_id => %L::uuid, include_confidential => true)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'other user cannot call get_workspace_wallets_income as the workspace creator'
);
select throws_ok(
  format('select public.get_workspace_wallets_expense(ws_id => %L::uuid, p_user_id => %L::uuid, include_confidential => true)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'other user cannot call get_workspace_wallets_expense as the workspace creator'
);
select throws_ok(
  format('select count(*) from public.get_transactions_by_period(p_ws_id => %L::uuid, p_user_id => %L::uuid, p_interval => ''monthly'')', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'other user cannot call get_transactions_by_period as the workspace creator'
);
select throws_ok(
  format('select count(*) from public.get_wallet_transactions_with_permissions(p_ws_id => %L::uuid, p_user_id => %L::uuid)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42501', null, 'other user cannot call get_wallet_transactions_with_permissions as the workspace creator'
);
reset role;

-- self: the workspace creator acting as themselves
set local role authenticated;
select set_config('request.jwt.claims', format('{"role":"authenticated","sub":"%s"}', pg_temp.fwag_id(1)), true);
select is(
  (select can_view_transactions from public.get_wallet_permission_context(pg_temp.fwag_id(10), pg_temp.fwag_id(1))),
  true,
  'self can call get_wallet_permission_context'
);
select is(
  (select public.get_wallet_income_sum(pg_temp.fwag_id(10), pg_temp.fwag_id(1), true)),
  100::numeric,
  'self can call get_wallet_income_sum'
);
select is(
  (select public.get_wallet_income_count(pg_temp.fwag_id(10), pg_temp.fwag_id(1), true)),
  1::bigint,
  'self can call get_wallet_income_count'
);
select is(
  (select public.get_wallet_expense_sum(pg_temp.fwag_id(10), pg_temp.fwag_id(1), true)),
  -40::numeric,
  'self can call get_wallet_expense_sum'
);
select is(
  (select public.get_wallet_expense_count(pg_temp.fwag_id(10), pg_temp.fwag_id(1), true)),
  1::bigint,
  'self can call get_wallet_expense_count'
);
select throws_ok(
  format('select public.get_workspace_wallets_income(ws_id => %L::uuid, p_user_id => %L::uuid, include_confidential => true)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42702', null,
  'self passes the get_workspace_wallets_income actor guard (body keeps its pre-existing ambiguous ws_id error)'
);
select throws_ok(
  format('select public.get_workspace_wallets_expense(ws_id => %L::uuid, p_user_id => %L::uuid, include_confidential => true)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42702', null,
  'self passes the get_workspace_wallets_expense actor guard (body keeps its pre-existing ambiguous ws_id error)'
);
select is(
  (select count(*) from public.get_transactions_by_period(p_ws_id => pg_temp.fwag_id(10), p_user_id => pg_temp.fwag_id(1), p_interval => 'monthly')),
  1::bigint,
  'self can call get_transactions_by_period'
);
select is(
  (select count(*) from public.get_wallet_transactions_with_permissions(p_ws_id => pg_temp.fwag_id(10), p_user_id => pg_temp.fwag_id(1))),
  2::bigint,
  'self can call get_wallet_transactions_with_permissions'
);
reset role;

-- service_role (server routes) acting for the workspace creator
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select can_view_transactions from public.get_wallet_permission_context(pg_temp.fwag_id(10), pg_temp.fwag_id(1))),
  true,
  'service_role can call get_wallet_permission_context for a user'
);
select is(
  (select public.get_wallet_income_sum(pg_temp.fwag_id(10), pg_temp.fwag_id(1), true)),
  100::numeric,
  'service_role can call get_wallet_income_sum for a user'
);
select is(
  (select public.get_wallet_income_count(pg_temp.fwag_id(10), pg_temp.fwag_id(1), true)),
  1::bigint,
  'service_role can call get_wallet_income_count for a user'
);
select is(
  (select public.get_wallet_expense_sum(pg_temp.fwag_id(10), pg_temp.fwag_id(1), true)),
  -40::numeric,
  'service_role can call get_wallet_expense_sum for a user'
);
select is(
  (select public.get_wallet_expense_count(pg_temp.fwag_id(10), pg_temp.fwag_id(1), true)),
  1::bigint,
  'service_role can call get_wallet_expense_count for a user'
);
select throws_ok(
  format('select public.get_workspace_wallets_income(ws_id => %L::uuid, p_user_id => %L::uuid, include_confidential => true)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42702', null,
  'service_role passes the get_workspace_wallets_income actor guard (body keeps its pre-existing ambiguous ws_id error)'
);
select throws_ok(
  format('select public.get_workspace_wallets_expense(ws_id => %L::uuid, p_user_id => %L::uuid, include_confidential => true)', pg_temp.fwag_id(10), pg_temp.fwag_id(1)),
  '42702', null,
  'service_role passes the get_workspace_wallets_expense actor guard (body keeps its pre-existing ambiguous ws_id error)'
);
select is(
  (select count(*) from public.get_transactions_by_period(p_ws_id => pg_temp.fwag_id(10), p_user_id => pg_temp.fwag_id(1), p_interval => 'monthly')),
  1::bigint,
  'service_role can call get_transactions_by_period for a user'
);
select is(
  (select count(*) from public.get_wallet_transactions_with_permissions(p_ws_id => pg_temp.fwag_id(10), p_user_id => pg_temp.fwag_id(1))),
  2::bigint,
  'service_role can call get_wallet_transactions_with_permissions for a user'
);
reset role;

select * from finish();

rollback;
