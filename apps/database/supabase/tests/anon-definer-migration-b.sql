begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(116);

create function pg_temp.adb_id(n integer) returns uuid
language sql immutable
as $$ select ('00009319-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

create function pg_temp.adb_public_execute(p_target regprocedure) returns boolean
language sql stable
as $$
  select exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) as acl
    where p.oid = p_target and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  )
$$;

-- Signed-in/service expectations transferred from A's catalog snapshot.
create temporary table adb_execute_expected(signature text primary key) on commit drop;
insert into adb_execute_expected values
  ('public.get_workspace_overview(text,text,text,text,text,text,text,integer,integer)'),
  ('public.get_recent_audit_logs(integer)'),
  ('public.get_power_users(integer)'),
  ('public.deduct_ai_credits(uuid,text,integer,integer,integer,text,uuid,uuid,jsonb)'),
  ('public.deduct_ai_credits(uuid,text,integer,integer,integer,text,uuid,uuid,jsonb,uuid,integer,integer)'),
  ('public.get_or_create_credit_balance(uuid)'),
  ('public.get_or_create_credit_balance(uuid,uuid)'),
  ('public.get_ai_credit_usage_summary(uuid,timestamptz)'),
  ('public.get_ai_credit_usage_summary(uuid,timestamptz,uuid)'),
  ('public.admin_list_ai_credit_transactions(integer,integer,uuid,uuid,text,text,text,text,timestamptz,timestamptz)'),
  ('public.cleanup_role_inconsistencies()'),
  ('public.normalize_task_sort_keys()');
select ok(to_regprocedure(signature) is not null
  and not has_function_privilege('authenticated', to_regprocedure(signature), 'execute')
  and has_function_privilege('service_role', to_regprocedure(signature), 'execute'),
  'reviewed B service_role-only expectation: ' || signature)
from adb_execute_expected order by signature;

-- Older overloads are shadowed by newer ones with defaults, so a call by name
-- raises 42725. Rename them inside this rolled-back transaction so each body
-- can be called directly. Targets are tracked by OID, which survives renames.
create temporary table adb_service_only(target regprocedure, label text, call_sql text) on commit drop;
insert into adb_service_only
select sig::regprocedure, sig, call_sql
from (values
  ('public.get_workspace_overview(text,text,text,text,text,text,text,integer,integer)',
   'select * from public.get_workspace_overview(null, null, null, null, null, ''created_at'', ''desc'', 10, 1)'),
  ('public.get_recent_audit_logs(integer)', 'select * from public.get_recent_audit_logs(1)'),
  ('public.get_power_users(integer)', 'select * from public.get_power_users(1)'),
  ('public.deduct_ai_credits(uuid,text,integer,integer,integer,text,uuid,uuid,jsonb)',
   format('select * from public.adb_deduct_ai_credits_9(%L::uuid, ''synthetic-model'', 1, 1, 0, ''chat'', null::uuid, null::uuid, null::jsonb)', pg_temp.adb_id(10))),
  ('public.deduct_ai_credits(uuid,text,integer,integer,integer,text,uuid,uuid,jsonb,uuid,integer,integer)',
   format('select * from public.deduct_ai_credits(%L::uuid, ''synthetic-model'', 1, 1, 0, ''chat'', null::uuid, null::uuid, null::jsonb, null::uuid, null::integer, null::integer)', pg_temp.adb_id(10))),
  ('public.get_or_create_credit_balance(uuid)',
   format('select * from public.adb_credit_balance_1(%L::uuid)', pg_temp.adb_id(10))),
  ('public.get_or_create_credit_balance(uuid,uuid)',
   format('select * from public.get_or_create_credit_balance(%L::uuid, %L::uuid)', pg_temp.adb_id(10), pg_temp.adb_id(1))),
  ('public.get_ai_credit_usage_summary(uuid,timestamptz)',
   format('select public.adb_usage_summary_2(%L::uuid, now())', pg_temp.adb_id(10))),
  ('public.get_ai_credit_usage_summary(uuid,timestamptz,uuid)',
   format('select public.get_ai_credit_usage_summary(%L::uuid, now(), %L::uuid)', pg_temp.adb_id(10), pg_temp.adb_id(1))),
  ('public.admin_list_ai_credit_transactions(integer,integer,uuid,uuid,text,text,text,text,timestamptz,timestamptz)',
   'select * from public.admin_list_ai_credit_transactions(1, 10, null::uuid, null::uuid, null::text, null::text, null::text, null::text, null::timestamptz, null::timestamptz)'),
  ('public.cleanup_role_inconsistencies()', 'select public.cleanup_role_inconsistencies()'),
  ('public.normalize_task_sort_keys()', 'select public.normalize_task_sort_keys()')
) as t(sig, call_sql);

-- C retires the broken legacy overloads; the working six-argument body remains.
select ok(
  to_regprocedure('public.get_or_create_notification_batch(uuid,uuid,text,integer)') is null,
  'C removes the broken four-argument notification batching overload'
);
select ok(
  to_regprocedure('public.get_or_create_notification_batch(uuid,uuid,text,integer,text)') is null,
  'C removes the broken five-argument notification batching overload'
);

-- guarded = false: the SQL wrapper relies on the get_category_breakdown
-- overload it calls (its by-name call is itself ambiguous today).
create temporary table adb_finance(target regprocedure, label text, call_sql text, guarded boolean) on commit drop;
insert into adb_finance
select sig::regprocedure, sig, call_sql, guarded
from (values
  ('public.get_daily_invoice_totals(uuid,integer,uuid[],uuid[],date,date)',
   format('select * from public.get_daily_invoice_totals(%L::uuid)', pg_temp.adb_id(10)), true),
  ('public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date)',
   format('select * from public.adb_weekly_invoice_totals_6(%L::uuid)', pg_temp.adb_id(10)), true),
  ('public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date,integer)',
   format('select * from public.get_weekly_invoice_totals(%L::uuid, 12, null::uuid[], null::uuid[], null::date, null::date, 1)', pg_temp.adb_id(10)), true),
  ('public.get_monthly_invoice_totals(uuid,integer,uuid[],uuid[],date,date)',
   format('select * from public.get_monthly_invoice_totals(%L::uuid)', pg_temp.adb_id(10)), true),
  ('public.get_category_breakdown(uuid,timestamptz,timestamptz,boolean,text,text)',
   format('select * from public.adb_category_breakdown_6(%L::uuid)', pg_temp.adb_id(10)), true),
  ('public.get_category_breakdown(uuid,timestamptz,timestamptz,boolean,text,text,boolean)',
   format('select * from public.adb_category_breakdown_7(%L::uuid)', pg_temp.adb_id(10)), true),
  ('public.get_monthly_category_breakdown(uuid,timestamptz,timestamptz,boolean)',
   format('select * from public.adb_monthly_category_breakdown_4(%L::uuid)', pg_temp.adb_id(10)), true),
  ('public.get_monthly_category_breakdown(uuid,timestamptz,timestamptz,boolean,text)',
   format('select * from public.get_monthly_category_breakdown(%L::uuid, null::timestamptz, null::timestamptz, true, ''expense'')', pg_temp.adb_id(10)), false),
  ('public.get_transaction_stats(uuid,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamptz,timestamptz)',
   format('select * from public.get_transaction_stats(%L::uuid)', pg_temp.adb_id(10)), true)
) as t(sig, call_sql, guarded);
grant select on adb_service_only, adb_finance to anon, authenticated, service_role;

alter function public.deduct_ai_credits(uuid,text,integer,integer,integer,text,uuid,uuid,jsonb) rename to adb_deduct_ai_credits_9;
alter function public.get_or_create_credit_balance(uuid) rename to adb_credit_balance_1;
alter function public.get_ai_credit_usage_summary(uuid,timestamptz) rename to adb_usage_summary_2;
alter function public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date) rename to adb_weekly_invoice_totals_6;
alter function public.get_category_breakdown(uuid,timestamptz,timestamptz,boolean,text,text) rename to adb_category_breakdown_6;
alter function public.get_category_breakdown(uuid,timestamptz,timestamptz,boolean,text,text,boolean) rename to adb_category_breakdown_7;
alter function public.get_monthly_category_breakdown(uuid,timestamptz,timestamptz,boolean) rename to adb_monthly_category_breakdown_4;

-- Users: 1 = workspace A creator, 2 = A member with finance view permissions,
-- 3 = A member without finance permissions, 4 = workspace B creator.
insert into auth.users (id)
values (pg_temp.adb_id(1)), (pg_temp.adb_id(2)), (pg_temp.adb_id(3)), (pg_temp.adb_id(4))
on conflict (id) do nothing;
insert into public.users (id)
values (pg_temp.adb_id(1)), (pg_temp.adb_id(2)), (pg_temp.adb_id(3)), (pg_temp.adb_id(4))
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values
  (pg_temp.adb_id(10), 'Reporting workspace', false, pg_temp.adb_id(1)),
  (pg_temp.adb_id(11), 'Other workspace', false, pg_temp.adb_id(4));

-- New workspaces seed a MEMBER admin default; clear workspace A defaults so
-- members only hold what their role grants.
delete from public.workspace_default_permissions
where ws_id = pg_temp.adb_id(10);

insert into public.workspace_members (ws_id, user_id, type)
values
  (pg_temp.adb_id(10), pg_temp.adb_id(1), 'MEMBER'),
  (pg_temp.adb_id(10), pg_temp.adb_id(2), 'MEMBER'),
  (pg_temp.adb_id(10), pg_temp.adb_id(3), 'MEMBER'),
  (pg_temp.adb_id(11), pg_temp.adb_id(4), 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;

insert into private.workspace_wallets (id, ws_id, name)
values (pg_temp.adb_id(40), pg_temp.adb_id(10), 'Synthetic wallet');
insert into public.transaction_categories (id, ws_id, name, is_expense)
values (pg_temp.adb_id(41), pg_temp.adb_id(10), 'Synthetic expense', true);
insert into public.wallet_transactions (wallet_id, category_id, amount, taken_at)
values
  (pg_temp.adb_id(40), pg_temp.adb_id(41), -40, now() - interval '1 day'),
  (pg_temp.adb_id(40), null, 100, now() - interval '1 day');

insert into public.workspace_roles (id, ws_id, name)
values (pg_temp.adb_id(20), pg_temp.adb_id(10), 'Finance viewer');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values
  (pg_temp.adb_id(10), pg_temp.adb_id(20), 'view_invoices', true),
  (pg_temp.adb_id(10), pg_temp.adb_id(20), 'view_finance_stats', true),
  (pg_temp.adb_id(10), pg_temp.adb_id(20), 'view_transactions', true)
on conflict (ws_id, permission, role_id) do update set enabled = excluded.enabled;
insert into public.workspace_role_members (role_id, user_id)
values (pg_temp.adb_id(20), pg_temp.adb_id(2));
insert into public.workspace_role_wallet_whitelist (role_id, wallet_id)
values (pg_temp.adb_id(20), pg_temp.adb_id(40));

-- Grants (12 + 9)
select ok(
  not has_function_privilege('anon', target, 'execute')
    and not has_function_privilege('authenticated', target, 'execute')
    and not pg_temp.adb_public_execute(target)
    and has_function_privilege('service_role', target, 'execute'),
  'service_role only: ' || label
)
from adb_service_only;

select ok(
  not has_function_privilege('anon', target, 'execute')
    and not pg_temp.adb_public_execute(target)
    and has_function_privilege('authenticated', target, 'execute')
    and has_function_privilege('service_role', target, 'execute'),
  'authenticated and service_role only: ' || label
)
from adb_finance;

-- anon (12 + 9)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(call_sql, '42501', null, 'anon denied: ' || label) from adb_service_only;
select throws_ok(call_sql, '42501', null, 'anon denied: ' || label) from adb_finance;
reset role;

-- An authenticated workspace creator cannot reach the service-role set (12)
set local role authenticated;
select set_config('request.jwt.claims', format('{"role":"authenticated","sub":"%s"}', pg_temp.adb_id(1)), true);
select throws_ok(call_sql, '42501', null, 'authenticated denied: ' || label) from adb_service_only;
reset role;

-- authenticated without a subject claim (8)
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(call_sql, '42501', null, 'no-subject authenticated denied: ' || label)
from adb_finance where guarded;
reset role;

-- authenticated non-member (8)
set local role authenticated;
select set_config('request.jwt.claims', format('{"role":"authenticated","sub":"%s"}', pg_temp.adb_id(4)), true);
select throws_ok(call_sql, '42501', null, 'non-member denied: ' || label)
from adb_finance where guarded;
reset role;

-- member without finance permissions (8)
set local role authenticated;
select set_config('request.jwt.claims', format('{"role":"authenticated","sub":"%s"}', pg_temp.adb_id(3)), true);
select throws_ok(call_sql, '42501', null, 'member without permission denied: ' || label)
from adb_finance where guarded;
reset role;

-- member with finance view permissions (8 + 5)
set local role authenticated;
select set_config('request.jwt.claims', format('{"role":"authenticated","sub":"%s"}', pg_temp.adb_id(2)), true);
select lives_ok(call_sql, 'permitted member allowed: ' || label)
from adb_finance where guarded;
select is(
  (select count(*) from public.get_daily_invoice_totals(pg_temp.adb_id(10))),
  14::bigint,
  'permitted member reads 14 daily invoice periods for the wallet'
);
select is(
  (select sum(total) from public.adb_category_breakdown_6(pg_temp.adb_id(10))),
  40::numeric,
  'permitted member reads the category breakdown'
);
select is(
  (select sum(total) from public.adb_monthly_category_breakdown_4(pg_temp.adb_id(10))),
  40::numeric,
  'permitted member reads the monthly category breakdown'
);
select results_eq(
  format('select total_transactions, total_income, total_expense from public.get_transaction_stats(%L::uuid, %L::uuid)', pg_temp.adb_id(10), pg_temp.adb_id(2)),
  $$values (2::bigint, 100::numeric, -40::numeric)$$,
  'permitted member reads transaction stats for themselves'
);
select throws_ok(
  format('select * from public.get_transaction_stats(%L::uuid, %L::uuid)', pg_temp.adb_id(10), pg_temp.adb_id(1)),
  '42501', null, 'member cannot evaluate transaction stats as another user'
);
reset role;

-- (1)
set local role authenticated;
select set_config('request.jwt.claims', format('{"role":"authenticated","sub":"%s"}', pg_temp.adb_id(1)), true);
select throws_ok(
  format('select * from public.get_transaction_stats(%L::uuid, %L::uuid)', pg_temp.adb_id(10), pg_temp.adb_id(2)),
  '42501', null, 'workspace creator cannot evaluate transaction stats as another user'
);
reset role;

-- service_role keeps the server paths (6 + 4)
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(call_sql, 'service_role allowed: ' || label)
from adb_service_only
where label in (
  'public.get_workspace_overview(text,text,text,text,text,text,text,integer,integer)',
  'public.get_recent_audit_logs(integer)',
  'public.get_power_users(integer)',
  'public.get_or_create_credit_balance(uuid,uuid)',
  'public.get_ai_credit_usage_summary(uuid,timestamptz,uuid)',
  'public.admin_list_ai_credit_transactions(integer,integer,uuid,uuid,text,text,text,text,timestamptz,timestamptz)'
);
select is(
  (select count(*) from public.get_workspace_overview(null, null, null, null, null, 'created_at', 'desc', 100, 1) where id = pg_temp.adb_id(10)),
  1::bigint,
  'service_role workspace overview lists the workspace'
);
select is(
  (select count(*) from public.get_daily_invoice_totals(pg_temp.adb_id(10))),
  14::bigint,
  'service_role reads daily invoice totals'
);
select is(
  (select sum(total) from public.adb_category_breakdown_6(pg_temp.adb_id(10))),
  40::numeric,
  'service_role reads the category breakdown'
);
select results_eq(
  format('select total_transactions from public.get_transaction_stats(%L::uuid, %L::uuid)', pg_temp.adb_id(10), pg_temp.adb_id(2)),
  $$values (2::bigint)$$,
  'service_role reads transaction stats for the supplied user'
);
reset role;

select * from finish();
rollback;
