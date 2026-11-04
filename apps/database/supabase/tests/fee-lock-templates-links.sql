-- M3 20261104130200 templates and M4 20261104130300 invoice links. Synthetic fixtures only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(32);

create function pg_temp.fid(n int) returns uuid language sql immutable as
  $$ select ('00000000-0000-4000-8000-0000000fe' || lpad(n::text, 3, '0'))::uuid $$;
grant execute on function pg_temp.fid(int) to service_role;

insert into auth.users(id, email) values (pg_temp.fid(901), 'fee-template-owner@example.test')
on conflict (id) do nothing;
insert into public.users(id, display_name) values (pg_temp.fid(901), 'Synthetic template owner')
on conflict (id) do nothing;
insert into public.workspaces(id, name, creator_id, personal) values
  (pg_temp.fid(910), 'Fee template fixture', pg_temp.fid(901), false),
  (pg_temp.fid(911), 'Fee template other workspace', pg_temp.fid(901), false);
insert into public.workspace_users(id, ws_id, full_name) values
  (pg_temp.fid(921), pg_temp.fid(910), 'Synthetic student'),
  (pg_temp.fid(922), pg_temp.fid(911), 'Synthetic other student');
insert into public.fee_locks(id, ws_id, student_id, period_month, status, revision, locked_at) values
  (pg_temp.fid(931), pg_temp.fid(910), pg_temp.fid(921), '2026-12-01', 'locked', 1, now()),
  (pg_temp.fid(932), pg_temp.fid(911), pg_temp.fid(922), '2026-12-01', 'locked', 1, now());
-- 933 is a never-locked draft (deletable under M1) that still has a revision row.
insert into public.fee_locks(id, ws_id, student_id, period_month) values
  (pg_temp.fid(933), pg_temp.fid(910), pg_temp.fid(921), '2027-01-01');
insert into public.fee_lock_revisions(fee_lock_id, ws_id, revision, total_amount, snapshot) values
  (pg_temp.fid(931), pg_temp.fid(910), 1, 1200000, '{}'), (pg_temp.fid(933), pg_temp.fid(910), 1, 0, '{}');
insert into private.workspace_wallets(id, ws_id, name) values
  (pg_temp.fid(941), pg_temp.fid(910), 'Synthetic wallet'),
  (pg_temp.fid(942), pg_temp.fid(911), 'Synthetic other wallet');
insert into public.transaction_categories(id, ws_id, name, is_expense) values
  (pg_temp.fid(943), pg_temp.fid(910), 'Synthetic income', false),
  (pg_temp.fid(944), pg_temp.fid(911), 'Synthetic other income', false);
insert into public.finance_invoices(id, ws_id, wallet_id, category_id, customer_id, price, notice) values
  (pg_temp.fid(951), pg_temp.fid(910), pg_temp.fid(941), pg_temp.fid(943), pg_temp.fid(921), 1200000, 'Synthetic tuition'),
  (pg_temp.fid(952), pg_temp.fid(911), pg_temp.fid(942), pg_temp.fid(944), pg_temp.fid(922), 1200000, 'Synthetic other tuition'),
  (pg_temp.fid(953), pg_temp.fid(910), pg_temp.fid(941), pg_temp.fid(943), pg_temp.fid(921), 1200000, 'Synthetic second tuition');

-- Save shorthand: workspace, body, expected version.
create function pg_temp.save(p_ws uuid, p_body text, p_expected int default null)
returns public.fee_notice_templates language sql as $$
  select * from private.fee_notice_template_save(p_ws, pg_temp.fid(901), p_body, '{{name}}: {{price}}đ/{{unit}}',
    ', ', 'Kính nhờ phụ huynh đóng tiền giúp {{centre_name}} ạ.', 'combined', 'vi', p_expected);
$$;
grant execute on function pg_temp.save(uuid, text, int) to service_role;

-- Access model.
select is((select count(*)::int from pg_class where relnamespace = 'public'::regnamespace
  and relname in ('fee_notice_templates', 'fee_lock_invoice_links') and relrowsecurity),
  2, 'RLS is enabled on both tables');
select is((select string_agg(tablename || ':' || policyname || ':' || permissive, ',' order by tablename) from pg_policies
  where schemaname = 'public' and tablename in ('fee_notice_templates', 'fee_lock_invoice_links')),
  'fee_lock_invoice_links:account_required_mfa:RESTRICTIVE,fee_notice_templates:account_required_mfa:RESTRICTIVE',
  'each table has only the restrictive MFA policy');
select is((select count(*)::int from unnest(array['anon', 'authenticated']) r
  cross join unnest(array['public.fee_notice_templates', 'public.fee_lock_invoice_links']) t
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
  where has_table_privilege(r, t, p)), 0, 'anon and authenticated hold no table privilege');
select ok(not has_function_privilege('anon', f, 'EXECUTE') and not has_function_privilege('authenticated', f, 'EXECUTE')
  and has_function_privilege('service_role', f, 'EXECUTE'), 'only service_role can call the template save function')
from (values ('private.fee_notice_template_save(uuid,uuid,text,text,text,text,text,text,integer,integer)')) v(f);
select ok(not has_function_privilege('authenticated', 'private.fee_lock_invoice_links_same_workspace()', 'EXECUTE'),
  'clients cannot call the link workspace trigger function');
select is((select prosecdef::text || ':' || array_to_string(proconfig, ',') from pg_proc
  where oid = 'private.fee_notice_template_save(uuid,uuid,text,text,text,text,text,text,integer,integer)'::regprocedure),
  'false:search_path=pg_catalog, pg_temp', 'the save function is SECURITY INVOKER with a pinned search_path');

-- Templates.
set local role service_role;
select is((pg_temp.save(pg_temp.fid(910), '{{centre_name}} {{month}}: {{tuition}}{{items_with_prefix}}. {{payment_line}}')).version,
  1, 'the first save creates version 1');
select is((pg_temp.save(pg_temp.fid(910), 'Tổng: {{total}}đ', 1)).version, 2, 'the next save creates version 2');
select is((select string_agg(version || ':' || is_active, ',' order by version) from public.fee_notice_templates
  where ws_id = pg_temp.fid(910)), '1:false,2:true', 'only the newest version is active');
select throws_ok($$select pg_temp.save(pg_temp.fid(910), 'stale', 1)$$,
  '40001', 'fee notice template version conflict', 'a save based on an old version is rejected');
select throws_ok($$select pg_temp.save(pg_temp.fid(910), 'Gọi {{phone}}')$$,
  '22023', null, 'unknown body placeholders are rejected');
select throws_ok($$select private.fee_notice_template_save(pg_temp.fid(910), pg_temp.fid(901), '{{total}}',
  '{{name}} {{total}}', ', ', '', 'combined', 'vi')$$,
  '22023', null, 'item placeholders follow their own allowlist');
select throws_ok($$select private.fee_notice_template_save(pg_temp.fid(910), pg_temp.fid(901), '{{total}}',
  '{{name}}', ', ', '', 'per_student', 'vi')$$,
  '23514', null, 'the grouping mode is combined or per_class');
select throws_ok($$select pg_temp.save('00000000-0000-4000-8000-000000000000', '{{total}}')$$,
  '23503', 'workspace not found', 'saving for an unknown workspace fails');
select throws_ok($$insert into public.fee_notice_templates(ws_id, version, is_active, body, item_format, item_separator)
  values (pg_temp.fid(910), 99, true, 'x', '', '')$$,
  '23505', null, 'a workspace has at most one active template');
select is((select count(*)::int from public.fee_lock_events where ws_id = pg_temp.fid(910)
  and event_type = 'template_saved' and actor_id = pg_temp.fid(901)
  and metadata ->> 'template_version' = '2' and metadata ->> 'previous_version' = '1'),
  1, 'each save records a template_saved event with the actor and versions');
select lives_ok($$select pg_temp.save(pg_temp.fid(910), 'v' || g) from generate_series(3, 23) g$$,
  'twenty-one more saves succeed');
select is((select count(*)::int || ':' || min(version) || '-' || max(version) from public.fee_notice_templates
  where ws_id = pg_temp.fid(910)), '20:4-23', 'only the last 20 versions are kept');

-- Invoice links.
select lives_ok($$insert into public.fee_lock_invoice_links(ws_id, invoice_id, fee_lock_id, fee_lock_revision,
  suggested_total, charged_total, created_by) values (pg_temp.fid(910), pg_temp.fid(951), pg_temp.fid(931), 1,
  1200000, 1100000, pg_temp.fid(901))$$, 'an invoice can be linked to a fee lock revision');
select throws_ok($$insert into public.fee_lock_invoice_links(ws_id, invoice_id, fee_lock_id, fee_lock_revision,
  suggested_total, charged_total) values (pg_temp.fid(910), pg_temp.fid(951), pg_temp.fid(931), 1, 0, 0)$$,
  '23505', null, 'an invoice links to a fee lock once');
select throws_ok($$insert into public.fee_lock_invoice_links(ws_id, invoice_id, fee_lock_id, fee_lock_revision,
  suggested_total, charged_total) values (pg_temp.fid(910), pg_temp.fid(953), pg_temp.fid(931), 1, 0, 0)$$,
  '23505', null, 'one locked revision pre-fills at most one invoice');
select throws_ok($$insert into public.fee_lock_invoice_links(ws_id, invoice_id, fee_lock_id, fee_lock_revision,
  suggested_total, charged_total) values (pg_temp.fid(910), pg_temp.fid(953), pg_temp.fid(931), 2, 0, 0)$$,
  '23503', null, 'the linked revision must exist for that fee lock');
insert into public.fee_lock_invoice_links(ws_id, invoice_id, fee_lock_id, fee_lock_revision, suggested_total, charged_total)
  values (pg_temp.fid(910), pg_temp.fid(953), pg_temp.fid(933), 1, 0, 0);

-- Same-workspace guards, one per reference.
select throws_ok($$insert into public.fee_lock_invoice_links(ws_id, invoice_id, fee_lock_id, fee_lock_revision,
  suggested_total, charged_total) values (pg_temp.fid(910), pg_temp.fid(952), pg_temp.fid(931), 1, 0, 0)$$,
  '23514', 'invoice_id does not belong to ws_id', 'an invoice from another workspace is rejected');
select throws_ok($$insert into public.fee_lock_invoice_links(ws_id, invoice_id, fee_lock_id, fee_lock_revision,
  suggested_total, charged_total) values (pg_temp.fid(910), pg_temp.fid(951), pg_temp.fid(932), 1, 0, 0)$$,
  '23514', 'fee_lock_id does not belong to ws_id', 'a fee lock from another workspace is rejected');
-- Links are immutable after insert and cannot be truncated.
select throws_ok($$update public.fee_lock_invoice_links set invoice_id = pg_temp.fid(952)
  where invoice_id = pg_temp.fid(951)$$,
  '55000', 'fee_lock_invoice_links rows are immutable', 'a link cannot be moved to another invoice');
select throws_ok($$update public.fee_lock_invoice_links set charged_total = 1 where invoice_id = pg_temp.fid(951)$$,
  '55000', 'fee_lock_invoice_links rows are immutable', 'linked totals cannot be changed');
select throws_ok($$truncate public.fee_lock_invoice_links$$,
  '55000', 'fee_lock_invoice_links rows are immutable', 'links cannot be truncated');
select throws_ok($$insert into public.fee_lock_invoice_links(ws_id, invoice_id, fee_lock_id, fee_lock_revision,
  suggested_total, charged_total) values (pg_temp.fid(910), pg_temp.fid(951), pg_temp.fid(931), 0, 0, 0)$$,
  '23514', null, 'the linked revision is at least 1');

-- Deletes never reach financial rows: a linked invoice or fee lock stays.
reset role;
select throws_ok($$delete from public.finance_invoices where id = pg_temp.fid(951)$$,
  '23503', null, 'a linked invoice cannot be deleted');
select throws_ok($$delete from public.fee_locks where id = pg_temp.fid(933)$$,
  '23503', null, 'a linked fee lock cannot be deleted, even a deletable draft');

-- Rollback guards (copied from apps/database/rollbacks/202611041302/1303_*; keep in sync).
select throws_ok($q$do $g$ begin if exists (select 1 from public.fee_lock_invoice_links) then
  raise exception 'fee lock invoice links exist; export and delete them first'; end if;
  lock table public.fee_lock_invoice_links in access exclusive mode; end $g$$q$, 'P0001',
  'fee lock invoice links exist; export and delete them first', 'the links rollback refuses while links exist');
select throws_ok($q$do $g$ begin if exists (select 1 from public.fee_notice_templates) then
  raise exception 'fee notice templates exist; export and delete them first'; end if;
  lock table public.fee_notice_templates in access exclusive mode; end $g$$q$, 'P0001',
  'fee notice templates exist; export and delete them first', 'the templates rollback refuses while templates exist');

select * from finish();
rollback;
