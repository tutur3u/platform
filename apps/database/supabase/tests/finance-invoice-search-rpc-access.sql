begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

create function pg_temp.fisr_id(n integer) returns uuid
language sql immutable
as $$ select ('00009031-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- Users: 1 = workspace A creator, 2 = A member with view_invoices,
-- 3 = A member without finance permissions, 4 = workspace B creator.
insert into auth.users (id)
values (pg_temp.fisr_id(1)), (pg_temp.fisr_id(2)), (pg_temp.fisr_id(3)), (pg_temp.fisr_id(4))
on conflict (id) do nothing;
insert into public.users (id)
values (pg_temp.fisr_id(1)), (pg_temp.fisr_id(2)), (pg_temp.fisr_id(3)), (pg_temp.fisr_id(4))
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values
  (pg_temp.fisr_id(10), 'Invoice workspace', false, pg_temp.fisr_id(1)),
  (pg_temp.fisr_id(11), 'Other workspace', false, pg_temp.fisr_id(4));

-- New workspaces seed a MEMBER admin default; clear workspace A defaults so
-- members only hold what their role grants.
delete from public.workspace_default_permissions
where ws_id = pg_temp.fisr_id(10);

insert into public.workspace_members (ws_id, user_id, type)
values
  (pg_temp.fisr_id(10), pg_temp.fisr_id(1), 'MEMBER'),
  (pg_temp.fisr_id(10), pg_temp.fisr_id(2), 'MEMBER'),
  (pg_temp.fisr_id(10), pg_temp.fisr_id(3), 'MEMBER'),
  (pg_temp.fisr_id(11), pg_temp.fisr_id(4), 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;

insert into public.workspace_roles (id, ws_id, name)
values (pg_temp.fisr_id(20), pg_temp.fisr_id(10), 'Invoice viewer');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values (pg_temp.fisr_id(10), pg_temp.fisr_id(20), 'view_invoices', true)
on conflict (ws_id, permission, role_id) do update set enabled = excluded.enabled;
insert into public.workspace_role_members (role_id, user_id)
values (pg_temp.fisr_id(20), pg_temp.fisr_id(2));

insert into public.workspace_users (id, ws_id, full_name)
values (pg_temp.fisr_id(30), pg_temp.fisr_id(10), 'Synthetic invoice customer');
insert into private.workspace_wallets (id, ws_id, name)
values (pg_temp.fisr_id(40), pg_temp.fisr_id(10), 'Synthetic wallet');
insert into public.transaction_categories (id, ws_id, name, is_expense)
values (pg_temp.fisr_id(41), pg_temp.fisr_id(10), 'Synthetic income', false);
insert into public.finance_invoices (
  id, ws_id, wallet_id, category_id, customer_id, price, notice, created_at
)
values (
  pg_temp.fisr_id(50), pg_temp.fisr_id(10), pg_temp.fisr_id(40), pg_temp.fisr_id(41),
  pg_temp.fisr_id(30), 125, 'Synthetic tuition', now() - interval '1 day'
);

-- Privileges
select ok(
  not has_function_privilege('anon', 'public.search_finance_invoices(uuid,text,timestamptz,timestamptz,uuid[],uuid[],integer,integer)', 'execute'),
  'anon cannot execute search_finance_invoices'
);
select ok(
  not has_function_privilege('anon', 'public.get_invoice_totals_by_date_range(uuid,timestamptz,timestamptz,uuid[],uuid[],boolean,integer,text)', 'execute'),
  'anon cannot execute get_invoice_totals_by_date_range'
);
select ok(
  has_function_privilege('service_role', 'public.search_finance_invoices(uuid,text,timestamptz,timestamptz,uuid[],uuid[],integer,integer)', 'execute')
  and has_function_privilege('service_role', 'public.get_invoice_totals_by_date_range(uuid,timestamptz,timestamptz,uuid[],uuid[],boolean,integer,text)', 'execute'),
  'service_role keeps EXECUTE on both RPCs'
);
select is(
  (
    select count(*)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('search_finance_invoices', 'get_invoice_totals_by_date_range')
      and (
        has_function_privilege('anon', p.oid, 'execute')
        or coalesce(pg_catalog.array_to_string(p.proconfig, ','), '') <> 'search_path=pg_catalog, pg_temp'
      )
  ),
  0::bigint,
  'no overload is anon-executable or left with an unpinned search_path'
);

-- anon (Data API with the publishable key)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  format('select * from public.search_finance_invoices(%L::uuid, %L)', pg_temp.fisr_id(10), ''),
  '42501', null, 'anon search_finance_invoices call is denied'
);
select throws_ok(
  format('select * from public.get_invoice_totals_by_date_range(%L::uuid)', pg_temp.fisr_id(10)),
  '42501', null, 'anon get_invoice_totals_by_date_range call is denied'
);
reset role;

-- authenticated without a subject claim
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  format('select * from public.search_finance_invoices(%L::uuid, %L)', pg_temp.fisr_id(10), ''),
  '42501', null, 'authenticated call without a user is denied (NULL-safe)'
);
reset role;

-- authenticated user of another workspace
set local role authenticated;
select set_config('request.jwt.claims', format('{"role":"authenticated","sub":"%s"}', pg_temp.fisr_id(4)), true);
select throws_ok(
  format('select * from public.search_finance_invoices(%L::uuid, %L)', pg_temp.fisr_id(10), ''),
  '42501', null, 'other-workspace user cannot search invoices'
);
select throws_ok(
  format('select * from public.get_invoice_totals_by_date_range(%L::uuid)', pg_temp.fisr_id(10)),
  '42501', null, 'other-workspace user cannot read invoice totals'
);
select throws_ok(
  format('select * from public.get_invoice_totals_by_date_range(%L::uuid, group_by_creator => true)', pg_temp.fisr_id(10)),
  '42501', null, 'other-workspace user cannot read invoice totals by creator'
);
reset role;

-- same-workspace member without view_invoices
set local role authenticated;
select set_config('request.jwt.claims', format('{"role":"authenticated","sub":"%s"}', pg_temp.fisr_id(3)), true);
select throws_ok(
  format('select * from public.search_finance_invoices(%L::uuid, %L)', pg_temp.fisr_id(10), ''),
  '42501', null, 'member without view_invoices cannot search invoices'
);
select throws_ok(
  format('select * from public.get_invoice_totals_by_date_range(%L::uuid)', pg_temp.fisr_id(10)),
  '42501', null, 'member without view_invoices cannot read invoice totals'
);
reset role;

-- permitted member
set local role authenticated;
select set_config('request.jwt.claims', format('{"role":"authenticated","sub":"%s"}', pg_temp.fisr_id(2)), true);
select is(
  (select count(*) from public.search_finance_invoices(pg_temp.fisr_id(10), 'Synthetic')),
  1::bigint,
  'permitted member finds the workspace invoice'
);
select is(
  (select customer_full_name from public.search_finance_invoices(pg_temp.fisr_id(10), 'Synthetic invoice customer')),
  'Synthetic invoice customer',
  'permitted member search still joins the workspace customer'
);
select is(
  (select total_count from public.search_finance_invoices(pg_temp.fisr_id(10), '', p_wallet_ids => array[pg_temp.fisr_id(40)])),
  1::bigint,
  'permitted member wallet-filtered search still resolves wallet transactions'
);
select is(
  (select sum(invoice_count) from public.get_invoice_totals_by_date_range(pg_temp.fisr_id(10), now() - interval '7 days', now())),
  1::numeric,
  'permitted member reads invoice totals grouped by wallet'
);
select is(
  (select sum(total_amount) from public.get_invoice_totals_by_date_range(pg_temp.fisr_id(10), now() - interval '7 days', now(), interval_type => 'week')),
  125::numeric,
  'permitted member reads weekly invoice totals'
);
select lives_ok(
  format('select * from public.get_invoice_totals_by_date_range(%L::uuid, now() - interval ''120 days'', now(), group_by_creator => true)', pg_temp.fisr_id(10)),
  'permitted member reads monthly invoice totals grouped by creator'
);
reset role;

-- workspace creator keeps access
set local role authenticated;
select set_config('request.jwt.claims', format('{"role":"authenticated","sub":"%s"}', pg_temp.fisr_id(1)), true);
select is(
  (select count(*) from public.search_finance_invoices(pg_temp.fisr_id(10), '')),
  1::bigint,
  'workspace creator keeps invoice search access'
);
reset role;

-- service_role (Finance server routes) is unaffected
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select count(*) from public.search_finance_invoices(pg_temp.fisr_id(10), 'Synthetic')),
  1::bigint,
  'service_role search is unaffected'
);
select is(
  (select sum(invoice_count) from public.get_invoice_totals_by_date_range(pg_temp.fisr_id(10), now() - interval '7 days', now())),
  1::numeric,
  'service_role invoice totals are unaffected'
);
select is(
  (select count(*) from public.get_invoice_totals_by_date_range(pg_temp.fisr_id(10), now() - interval '7 days', now(), group_by_creator => true)) > 0,
  true,
  'service_role creator-grouped totals are unaffected'
);
reset role;

select * from finish();

rollback;
