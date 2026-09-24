begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(13);
select has_column('public', 'finance_invoices', 'subscription_months', 'Invoices retain explicit tuition months');
select ok(private.valid_subscription_months(null), 'Unknown legacy coverage is allowed');
select ok(private.valid_subscription_months(array['2026-07-01','2026-09-01']::date[]), 'Noncontiguous tuition months retain gaps');
select ok(not private.valid_subscription_months(array[]::date[]), 'Empty explicit coverage is rejected');
select ok(not private.valid_subscription_months(array['2026-09-02']::date[]), 'Partial months are rejected');
select ok(not private.valid_subscription_months(array['2026-09-01','2026-09-01']::date[]), 'Duplicate months are rejected');
select ok(not private.valid_subscription_months(array[null]::date[]), 'Null months are rejected');
select ok(not private.valid_subscription_months(array(select (date '2026-01-01' + i * interval '1 month')::date from generate_series(0,12) i)), 'More than twelve months is rejected');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.workspaces(id, name, personal, creator_id) values ('00000000-0000-4000-8000-000000099001', 'Coverage fixture', false, '00000000-0000-0000-0000-000000000001');
insert into private.workspace_wallets(id, ws_id, name) values ('00000000-0000-4000-8000-000000099002', '00000000-0000-4000-8000-000000099001', 'Coverage wallet');
insert into public.transaction_categories(id, ws_id, name, is_expense) values ('00000000-0000-4000-8000-000000099003', '00000000-0000-4000-8000-000000099001', 'Tuition', false);
insert into public.workspace_users(id, ws_id, full_name) values ('00000000-0000-4000-8000-000000099004', '00000000-0000-4000-8000-000000099001', 'Coverage student');
insert into public.workspace_user_groups(id, ws_id, name, starting_date) values ('00000000-0000-4000-8000-000000099005', '00000000-0000-4000-8000-000000099001', 'Coverage class', date_trunc('month', current_date) - interval '2 months');
insert into public.workspace_user_groups_users(user_id, group_id, role) values ('00000000-0000-4000-8000-000000099004', '00000000-0000-4000-8000-000000099005', 'STUDENT');
insert into private.workspace_user_group_sessions(ws_id, group_id, starts_at, ends_at)
select '00000000-0000-4000-8000-000000099001', '00000000-0000-4000-8000-000000099005', month + interval '4 days 12 hours', month + interval '4 days 13 hours'
from generate_series(date_trunc('month', current_date) - interval '2 months', date_trunc('month', current_date), interval '1 month') month;
insert into public.finance_invoices(id, ws_id, wallet_id, category_id, customer_id, price, paid_amount, completed_at, subscription_months)
values ('00000000-0000-4000-8000-000000099006', '00000000-0000-4000-8000-000000099001', '00000000-0000-4000-8000-000000099002', '00000000-0000-4000-8000-000000099003', '00000000-0000-4000-8000-000000099004', 1200, 1200, now(), array[(date_trunc('month', current_date) - interval '2 months')::date,date_trunc('month',current_date)::date]);
insert into public.finance_invoice_user_groups(invoice_id,user_group_id) values ('00000000-0000-4000-8000-000000099006','00000000-0000-4000-8000-000000099005');
select is((select valid_until from public.finance_invoices where id='00000000-0000-4000-8000-000000099006'), (date_trunc('month',current_date) + interval '1 month')::timestamptz, 'Compatibility end is derived from explicit months');
select is((select count(*)::int from public.get_pending_invoices_base('00000000-0000-4000-8000-000000099001',false)), 1, 'A paid later month does not hide an earlier unpaid month');
select is((select month from public.get_pending_invoices_base('00000000-0000-4000-8000-000000099001',false)), to_char(current_date - interval '1 month','YYYY-MM'), 'The actual gap remains pending');
select is((select (jsonb_populate_record(null::public.finance_invoices,to_jsonb(fi))).subscription_months from public.finance_invoices fi where id='00000000-0000-4000-8000-000000099006'), array[(date_trunc('month',current_date) - interval '2 months')::date,date_trunc('month',current_date)::date], 'Recovery snapshots retain exact coverage');
update public.finance_invoices set completed_at=null where id='00000000-0000-4000-8000-000000099006';
select is((select count(*)::int from public.get_pending_invoices_base('00000000-0000-4000-8000-000000099001',false)), 3, 'Uncompleted invoices do not cover months');
select * from finish();
rollback;
