-- Invoice compensating cleanup (20261104130500): the fee-lock link and the new
-- invoice are deleted together in one transaction, or neither is. Synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

create function pg_temp.fid(n int) returns uuid language sql immutable as
  $$ select ('00000000-0000-4000-8000-0000000fe' || lpad(n::text, 3, '0'))::uuid $$;
insert into auth.users(id, email) values (pg_temp.fid(801), 'fee-cleanup-owner@example.test') on conflict (id) do nothing;
insert into public.users(id, display_name) values (pg_temp.fid(801), 'Synthetic cleanup owner') on conflict (id) do nothing;
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
insert into public.finance_invoices(id, ws_id, wallet_id, category_id, customer_id, price, notice) values
  (pg_temp.fid(851), pg_temp.fid(810), pg_temp.fid(841), pg_temp.fid(843), pg_temp.fid(821), 1200000, 'Synthetic tuition'),
  (pg_temp.fid(852), pg_temp.fid(810), pg_temp.fid(841), pg_temp.fid(843), pg_temp.fid(821), 1200000, 'Synthetic tuition 2'),
  (pg_temp.fid(853), pg_temp.fid(811), pg_temp.fid(842), pg_temp.fid(844), pg_temp.fid(822), 1200000, 'Synthetic other tuition');
insert into public.finance_invoice_user_groups(invoice_id, user_group_id) values (pg_temp.fid(851), pg_temp.fid(825));
insert into public.fee_lock_invoice_links(ws_id, invoice_id, fee_lock_id, fee_lock_revision, suggested_total, charged_total) values
  (pg_temp.fid(810), pg_temp.fid(851), pg_temp.fid(831), 1, 1200000, 1200000),
  (pg_temp.fid(810), pg_temp.fid(852), pg_temp.fid(832), 1, 1200000, 1100000),
  (pg_temp.fid(811), pg_temp.fid(853), pg_temp.fid(833), 1, 1200000, 1200000);
-- Counts the link and the invoice still present for an invoice suffix.
create function pg_temp.left_over(n int) returns text language sql as $$
  select (select count(*) from public.fee_lock_invoice_links where invoice_id = pg_temp.fid(n)) || ':'
    || (select count(*) from public.finance_invoices where id = pg_temp.fid(n)) $$;

select ok(not has_function_privilege('authenticated', 'private.fee_lock_discard_new_invoice(uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.fee_lock_discard_new_invoice(uuid, uuid)', 'EXECUTE'), 'clients cannot call the cleanup');
select ok(has_function_privilege('service_role', 'private.fee_lock_discard_new_invoice(uuid, uuid)', 'EXECUTE'), 'service_role can call the cleanup');

-- Another workspace's invoice: nothing happens.
select is(private.fee_lock_discard_new_invoice(pg_temp.fid(810), pg_temp.fid(853)), false, 'an invoice of another workspace is not discarded');
select is(pg_temp.left_over(853), '1:1', 'its link and invoice stay');

-- Both go together.
select is(private.fee_lock_discard_new_invoice(pg_temp.fid(810), pg_temp.fid(851)), true, 'a new linked invoice is discarded');
select is(pg_temp.left_over(851) || ':' || (select count(*) from public.finance_invoice_user_groups where invoice_id = pg_temp.fid(851)),
  '0:0:0', 'its link, class rows and invoice are gone together');

-- Neither goes: a row the cleanup does not own still references invoice 852,
-- so the invoice delete fails and the link delete rolls back with it.
create table public.fee_lock_cleanup_test_blocker (invoice_id uuid references public.finance_invoices(id));
insert into public.fee_lock_cleanup_test_blocker values (pg_temp.fid(852));
select throws_ok($$select private.fee_lock_discard_new_invoice(pg_temp.fid(810), pg_temp.fid(852))$$, '23503', null,
  'a failing invoice delete fails the whole cleanup');
select is(pg_temp.left_over(852), '1:1', 'after the failed cleanup the link and the invoice both remain');

select * from finish();
rollback;
