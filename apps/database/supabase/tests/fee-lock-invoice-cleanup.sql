-- Invoice compensating cleanup (20261104130500): only an invoice created by the same actor in the
-- same request, not paid outside it, is discarded; the link and then the invoice go in one
-- transaction, or neither does; every discard is audited without amounts. Synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(13);

create function pg_temp.fid(n int) returns uuid language sql immutable as
  $$ select ('00000000-0000-4000-8000-0000000fe' || lpad(n::text, 3, '0'))::uuid $$;
insert into auth.users(id, email) values (pg_temp.fid(801), 'fee-cleanup-owner@example.test'), (pg_temp.fid(802), 'fee-cleanup-other@example.test') on conflict (id) do nothing;
insert into public.users(id, display_name) values (pg_temp.fid(801), 'Synthetic cleanup owner'), (pg_temp.fid(802), 'Synthetic other staff') on conflict (id) do nothing;
insert into public.workspaces(id, name, creator_id, personal) values
  (pg_temp.fid(810), 'Fee cleanup fixture', pg_temp.fid(801), false), (pg_temp.fid(811), 'Fee cleanup other', pg_temp.fid(801), false);
insert into public.workspace_users(id, ws_id, full_name) values
  (pg_temp.fid(821), pg_temp.fid(810), 'Synthetic student'), (pg_temp.fid(822), pg_temp.fid(811), 'Synthetic other student');
insert into public.workspace_user_groups(id, ws_id, name) values (pg_temp.fid(825), pg_temp.fid(810), 'Synthetic class');
-- Locked fee locks with revision 1: 831 and 832 in the workspace, 833 in the other one.
insert into public.fee_locks(id, ws_id, student_id, period_month, status, revision, locked_at) values
  (pg_temp.fid(831), pg_temp.fid(810), pg_temp.fid(821), '2026-12-01', 'locked', 1, now()),
  (pg_temp.fid(832), pg_temp.fid(810), pg_temp.fid(821), '2027-01-01', 'locked', 1, now()),
  (pg_temp.fid(833), pg_temp.fid(811), pg_temp.fid(822), '2026-12-01', 'locked', 1, now());
insert into public.fee_lock_revisions(fee_lock_id, ws_id, revision, total_amount, snapshot)
select id, ws_id, 1, 1200000, '{}' from public.fee_locks where id in (pg_temp.fid(831), pg_temp.fid(832), pg_temp.fid(833));
insert into private.workspace_wallets(id, ws_id, name) values (pg_temp.fid(841), pg_temp.fid(810), 'Synthetic wallet'), (pg_temp.fid(842), pg_temp.fid(811), 'Synthetic other wallet');
insert into public.transaction_categories(id, ws_id, name, is_expense) values
  (pg_temp.fid(843), pg_temp.fid(810), 'Synthetic income', false), (pg_temp.fid(844), pg_temp.fid(811), 'Synthetic other income', false);
-- 851-853 were created by actor 801 in this request; 854 a day earlier, 855 by another actor, 856 paid an hour later.
insert into public.finance_invoices(id, ws_id, wallet_id, category_id, customer_id, price, notice, platform_creator_id, created_at, completed_at)
select pg_temp.fid(n), pg_temp.fid(ws), pg_temp.fid(w), pg_temp.fid(c), pg_temp.fid(cu), 1200000, 'Synthetic tuition', pg_temp.fid(a), now() + age, now() + done
from (values (851, 810, 841, 843, 821, 801, interval '0', interval '0'), (852, 810, 841, 843, 821, 801, interval '0', interval '0'),
  (853, 811, 842, 844, 822, 801, interval '0', interval '0'), (854, 810, 841, 843, 821, 801, interval '-1 day', interval '-1 day'),
  (855, 810, 841, 843, 821, 802, interval '0', interval '0'), (856, 810, 841, 843, 821, 801, interval '0', interval '1 hour')) v(n, ws, w, c, cu, a, age, done);
insert into public.finance_invoice_user_groups(invoice_id, user_group_id) values (pg_temp.fid(851), pg_temp.fid(825));
insert into public.fee_lock_invoice_links(ws_id, invoice_id, fee_lock_id, fee_lock_revision, suggested_total, charged_total) values
  (pg_temp.fid(810), pg_temp.fid(851), pg_temp.fid(831), 1, 1200000, 1200000),
  (pg_temp.fid(810), pg_temp.fid(852), pg_temp.fid(832), 1, 1200000, 1100000),
  (pg_temp.fid(811), pg_temp.fid(853), pg_temp.fid(833), 1, 1200000, 1200000);
-- Counts the link and the invoice still present for an invoice suffix.
create function pg_temp.left_over(n int) returns text language sql as $$
  select (select count(*) from public.fee_lock_invoice_links where invoice_id = pg_temp.fid(n)) || ':'
    || (select count(*) from public.finance_invoices where id = pg_temp.fid(n)) $$;
create function pg_temp.discard(n int, actor int default 801, reason text default 'Stock update failed') returns boolean language sql as $$
  select private.fee_lock_discard_new_invoice(pg_temp.fid(case when n = 853 then 811 else 810 end), pg_temp.fid(n), pg_temp.fid(actor), now() - interval '1 minute', reason) $$;

select ok(not has_function_privilege('authenticated', 'private.fee_lock_discard_new_invoice(uuid, uuid, uuid, timestamptz, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.fee_lock_discard_new_invoice(uuid, uuid, uuid, timestamptz, text)', 'EXECUTE'), 'clients cannot call the cleanup');
select ok(has_function_privilege('service_role', 'private.fee_lock_discard_new_invoice(uuid, uuid, uuid, timestamptz, text)', 'EXECUTE'), 'service_role can call the cleanup');
select throws_ok($$select pg_temp.discard(851, 801, '  ')$$, '22023', 'FEE_LOCK_INVALID_INPUT', 'a discard needs a reason');

-- Refused: another workspace, issued before this request, another actor, paid after the request.
select is(private.fee_lock_discard_new_invoice(pg_temp.fid(810), pg_temp.fid(853), pg_temp.fid(801), now() - interval '1 minute', 'x'), false, 'an invoice of another workspace is refused');
select is(pg_temp.discard(854), false, 'an invoice issued before this request is refused');
select is(pg_temp.discard(855, 801), false, 'an invoice another actor created is refused');
select is(pg_temp.discard(856), false, 'an invoice paid after this request is refused');
select is(pg_temp.left_over(853) || ',' || pg_temp.left_over(854) || ',' || pg_temp.left_over(855) || ',' || pg_temp.left_over(856)
  || ',' || (select count(*) from public.fee_lock_events where event_type = 'invoice_discarded'), '1:1,0:1,0:1,0:1,0', 'refused invoices and their links stay, unaudited');

-- Both go together, and the discard is audited without amounts or names.
select is(pg_temp.discard(851), true, 'a new linked invoice of this request is discarded');
select is(pg_temp.left_over(851) || ':' || (select count(*) from public.finance_invoice_user_groups where invoice_id = pg_temp.fid(851)),
  '0:0:0', 'its link, class rows and invoice are gone together');
select is((select jsonb_build_object('lock', fee_lock_id, 'actor', actor_id, 'reason', reason, 'revision', revision,
  'totals', coalesce(before_total, after_total), 'metadata', metadata)::text from public.fee_lock_events where event_type = 'invoice_discarded'),
  jsonb_build_object('lock', pg_temp.fid(831), 'actor', pg_temp.fid(801), 'reason', 'Stock update failed', 'revision', 1, 'totals', null,
    'metadata', jsonb_build_object('invoice_id', pg_temp.fid(851)))::text, 'the discard event names the lock, actor, reason and invoice id only');

-- Neither goes: a row the cleanup does not own still references invoice 852,
-- so the invoice delete fails and the link delete and event roll back with it.
create table public.fee_lock_cleanup_test_blocker (invoice_id uuid references public.finance_invoices(id));
insert into public.fee_lock_cleanup_test_blocker values (pg_temp.fid(852));
select throws_ok($$select pg_temp.discard(852)$$, '23503', null, 'a failing invoice delete fails the whole cleanup');
select is(pg_temp.left_over(852) || ':' || (select count(*) from public.fee_lock_events where event_type = 'invoice_discarded'), '1:1:1',
  'after the failed cleanup the link and the invoice both remain, with no extra event');

select * from finish();
rollback;
