begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(63);
insert into auth.users (id, aud, role, email, raw_app_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000009901', 'authenticated', 'authenticated', 'mfa-policy-test@tuturuuu.com', '{}', now(), now());
insert into public.users (id) values ('00000000-0000-4000-8000-000000009901') on conflict do nothing;
insert into auth.mfa_factors (id,user_id,factor_type,status,created_at,updated_at) values ('00000000-0000-4000-8000-000000009904','00000000-0000-4000-8000-000000009901','totp','verified',to_timestamp(1),to_timestamp(1));
insert into auth.sessions(id,user_id,factor_id,aal,created_at) values ('00000000-0000-4000-8000-000000009903','00000000-0000-4000-8000-000000009901','00000000-0000-4000-8000-000000009904','aal2',to_timestamp(1));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000009901","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-000000009903"}', true);
select ok(public.account_required_mfa_satisfied(), 'Missing policy preserves normal RLS behavior');
update auth.users set raw_app_meta_data = '{"tuturuuu_required_mfa":{"required":true,"verifiedAfter":100}}'
where id = '00000000-0000-4000-8000-000000009901';
select ok(not public.account_required_mfa_satisfied(), 'Fresh server policy rejects existing AAL1 JWT');
set local role authenticated;
select is((select count(*) from public.users where id = '00000000-0000-4000-8000-000000009901'), 0::bigint, 'Direct table read is blocked without MFA');
reset role;
select throws_ok($$select public.check_account_request()$$, '42501', 'MFA verification required', 'Pre-request hook protects reads and definer RPCs');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000009901","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-000000009903","amr":[{"method":"totp","timestamp":100}]}', true);
select ok(not public.account_required_mfa_satisfied(), 'Proof at reset boundary is rejected');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000009901","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-000000009903","amr":[{"method":"totp","timestamp":101}]}', true);
select ok(public.account_required_mfa_satisfied(), 'Verified MFA after boundary is accepted');
set local role authenticated;
select is((select count(*) from public.users where id = '00000000-0000-4000-8000-000000009901'), 1::bigint, 'Verified MFA restores ordinary scoped row access');
reset role;
update auth.users set raw_app_meta_data = '{"tuturuuu_required_mfa":{"required":true,"verifiedAfter":102}}'
where id = '00000000-0000-4000-8000-000000009901';
select ok(not public.account_required_mfa_satisfied(), 'Changing server policy invalidates earlier proof without JWT refresh');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000009901","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-000000009903"}', true);
insert into public.qr_login_challenges (id, secret_hash, status, approved_at, consumed_at, approver_user_id, request_metadata, approval_metadata)
values ('00000000-0000-4000-8000-000000009902', 'required-mfa-test-proof', 'consumed', now(), now(), '00000000-0000-4000-8000-000000009901',
  '{"kind":"mfa_mobile_approval","requesterSessionId":"00000000-0000-4000-8000-000000009903"}',
  jsonb_build_object('approverSessionId', '00000000-0000-4000-8000-000000009903', 'mobileMfaValidUntil', now() + interval '5 minutes', 'requiredMfaProof', jsonb_build_object('sessionId','00000000-0000-4000-8000-000000009903','factorId','00000000-0000-4000-8000-000000009904','verifiedAt', floor(extract(epoch from now())) - 1)));
select ok(public.account_required_mfa_satisfied(), 'Session-bound mobile approval satisfies required MFA');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000009901","role":"authenticated","aal":"aal1","session_id":"another-session"}', true);
select ok(not public.account_required_mfa_satisfied(), 'Another session cannot borrow a mobile approval');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000009901","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-000000009903"}', true);
update public.qr_login_challenges set approved_at = to_timestamp(100) where id = '00000000-0000-4000-8000-000000009902';
select ok(not public.account_required_mfa_satisfied(), 'Approval before recovery boundary is rejected');
update public.qr_login_challenges set approved_at = now(), approval_metadata = '{"approverSessionId":"session","mobileMfaValidUntil":"invalid"}' where id = '00000000-0000-4000-8000-000000009902';
select ok(not public.account_required_mfa_satisfied(), 'Malformed approval expiry fails closed without throwing');
update public.qr_login_challenges set approval_metadata = jsonb_build_object('approverSessionId', '00000000-0000-4000-8000-000000009903', 'mobileMfaValidUntil', now() - interval '1 second') where id = '00000000-0000-4000-8000-000000009902';
select ok(not public.account_required_mfa_satisfied(), 'Expired mobile approval is rejected');
update auth.users set raw_app_meta_data = '{"tuturuuu_required_mfa":null}' where id = '00000000-0000-4000-8000-000000009901';
select ok(not public.account_required_mfa_satisfied(), 'Malformed null policy fails closed');
update auth.users set raw_app_meta_data = '{"tuturuuu_required_mfa":{"required":false}}' where id = '00000000-0000-4000-8000-000000009901';
select ok(public.account_required_mfa_satisfied(), 'Explicitly disabled policy is honored');
select ok(not has_function_privilege('authenticated', 'public.required_mfa_enforcement_version()', 'EXECUTE'), 'Readiness probe is admin-only');
select ok(has_function_privilege('service_role', 'public.required_mfa_enforcement_version()', 'EXECUTE'), 'Service role can probe enforcement readiness');
-- Deparse the exact expression used by the enforcement migration on this server.
-- Both qualified/unqualified input resolve to public under this fixed search_path.
create temporary table mfa_canonical(id int);
create policy canonical on mfa_canonical
using ((select public.account_required_mfa_satisfied()))
with check ((select public.account_required_mfa_satisfied()));
create temporary table mfa_expected as
select pg_get_expr(polqual, polrelid) as expression from pg_policy
where polrelid = (select oid from pg_class where relname = 'mfa_canonical'
 and relnamespace = pg_my_temp_schema()) and polname = 'canonical';

-- Scope: config.toml [api] schemas, supplied by the contract runner. A plain
-- `supabase test db` has no runner, so it falls back to the committed list.
create temporary table mfa_scope(nspname text);
insert into mfa_scope
select unnest(string_to_array(coalesce(nullif(current_setting('test.mfa_schemas', true), ''),
 'public,graphql_public,storage,private'), ','));
-- Reachable by clients outside the API schemas: Realtime broadcast/presence
-- authorization reads this table, and the enforcement migration policies it.
create temporary table mfa_extra_scope(nspname text, relname text);
insert into mfa_extra_scope values ('realtime', 'messages');
select ok(not exists (
 select 1 from mfa_extra_scope x left join pg_namespace n on n.nspname = x.nspname
 left join pg_class c on c.relnamespace = n.oid and c.relname = x.relname
 where c.oid is null
), 'Every explicitly scoped relation (realtime.messages) exists');
select ok((select count(*) from mfa_scope where nspname in ('public','graphql_public','storage','private')) = 4,
 'Contract scope still covers the public, graphql_public, storage and private API schemas');

-- Exact-name exemptions only. Each names its tracking reference and is removed
-- once the relation carries the policy (the assertion below fails otherwise).
create temporary table mfa_exemptions(nspname text, relname text, tracking_ref text, reason text);
insert into mfa_exemptions values
 ('private', 'note_voice_jobs', 'SR-386',
  'Owner-read table predates MFA coverage; delete this row when its account_required_mfa policy lands.');

-- A relation carries the contract when RLS is on and the canonical restrictive
-- policy applies to authenticated for every command with the exact expression.
create temporary view mfa_covered as
select c.oid from pg_class c
where c.relkind in ('r','p') and c.relrowsecurity and exists (
 select 1 from pg_policy p where p.polrelid = c.oid
 and p.polname = 'account_required_mfa' and not p.polpermissive
 and p.polcmd = '*'
 and (0::oid = any(p.polroles) or (select oid from pg_roles where rolname = 'authenticated') = any(p.polroles))
 and pg_get_expr(p.polqual,p.polrelid) = (select expression from mfa_expected)
 and pg_get_expr(p.polwithcheck,p.polrelid) = (select expression from mfa_expected)
);

-- Anon/authenticated reach a relation only through a table or column privilege
-- (PUBLIC grants included). Column-level grants count.
create temporary view mfa_client_reachable as
select c.oid from pg_class c
where has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 or has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 or has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
 or has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES');

create temporary view mfa_exemption_violations as
select e.nspname, e.relname from mfa_exemptions e
left join pg_namespace n on n.nspname = e.nspname
left join pg_class c on c.relnamespace = n.oid and c.relname = e.relname
where c.oid is null
 or e.tracking_ref !~ '^SR-[0-9]+$'
 or has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 or has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
 or has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 or has_any_column_privilege('authenticated', c.oid, 'INSERT,UPDATE,REFERENCES')
 or c.oid in (select oid from mfa_covered);
select is((select string_agg(nspname || '.' || relname, ', ' order by nspname,relname)
 from mfa_exemption_violations), null::text,
 'Exemptions exist, name a tracking reference, grant clients at most SELECT and are still needed');

create temporary view mfa_coverage_violations as
select n.nspname, c.relname from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join mfa_extra_scope x on x.nspname = n.nspname and x.relname = c.relname
where (x.relname is not null or n.nspname in (select nspname from mfa_scope))
and c.relkind in ('r','p','v','m')
and not exists (select 1 from mfa_exemptions e
 where e.nspname = n.nspname and e.relname = c.relname)
-- No anon/authenticated privilege means no API, Realtime or Storage path.
and (x.relname is not null or c.oid in (select oid from mfa_client_reachable))
and (
  c.relkind = 'm'
  -- Invoker views read through their base tables' RLS. Postgres stores the
  -- option as written (on/true/1/yes...), so parse it with the boolean input.
  or (c.relkind = 'v' and not coalesce((
    select split_part(o, '=', 2)::boolean from unnest(c.reloptions) o
    where o like 'security\_invoker=%'), false))
  or (c.relkind in ('r','p')
    and c.oid not in (select oid from mfa_covered)
    -- RLS on with no policy at all denies every non-owner row.
    and not (c.relrowsecurity and not exists (
      select 1 from pg_policy p where p.polrelid = c.oid)))
);
select is((select string_agg(nspname || '.' || relname, ', ' order by nspname,relname)
 from mfa_coverage_violations), null::text,
 'All client-reachable exposed relations enforce MFA, including partitions and invoker views');

savepoint broken_coverage;
create table public.mfa_contract_probe(id int);
grant all on public.mfa_contract_probe to anon, authenticated;
select ok(exists(select 1 from mfa_coverage_violations where relname='mfa_contract_probe'), 'Detect RLS off');
alter table public.mfa_contract_probe enable row level security;
create policy account_required_mfa on public.mfa_contract_probe as restrictive for select to authenticated using(public.account_required_mfa_satisfied());
select ok(exists(select 1 from mfa_coverage_violations where relname='mfa_contract_probe'), 'Detect SELECT-only policy');
drop policy account_required_mfa on public.mfa_contract_probe;
create policy account_required_mfa on public.mfa_contract_probe as restrictive for all to anon using(public.account_required_mfa_satisfied()) with check(public.account_required_mfa_satisfied());
select ok(exists(select 1 from mfa_coverage_violations where relname='mfa_contract_probe'), 'Detect anon-only policy');
drop policy account_required_mfa on public.mfa_contract_probe;
create policy account_required_mfa on public.mfa_contract_probe as restrictive for all to authenticated using(true) with check(public.account_required_mfa_satisfied());
select ok(exists(select 1 from mfa_coverage_violations where relname='mfa_contract_probe'), 'Detect USING true');
drop policy account_required_mfa on public.mfa_contract_probe;
create policy account_required_mfa on public.mfa_contract_probe as restrictive for all to authenticated using(true OR public.account_required_mfa_satisfied()) with check((select public.account_required_mfa_satisfied()));
select ok(exists(select 1 from mfa_coverage_violations where relname='mfa_contract_probe'), 'Detect OR true');
drop policy account_required_mfa on public.mfa_contract_probe;
create policy account_required_mfa on public.mfa_contract_probe as restrictive for all to authenticated using((select public.account_required_mfa_satisfied())) with check(true);
select ok(exists(select 1 from mfa_coverage_violations where relname='mfa_contract_probe'), 'Detect WITH CHECK true');
drop policy account_required_mfa on public.mfa_contract_probe;
create policy account_required_mfa on public.mfa_contract_probe as restrictive for all to authenticated using((select public.account_required_mfa_satisfied()));
select ok(exists(select 1 from mfa_coverage_violations where relname='mfa_contract_probe'), 'Detect FOR ALL with USING only');
drop policy account_required_mfa on public.mfa_contract_probe;
create policy account_required_mfa on public.mfa_contract_probe as permissive for all to authenticated using((select public.account_required_mfa_satisfied())) with check((select public.account_required_mfa_satisfied()));
select ok(exists(select 1 from mfa_coverage_violations where relname='mfa_contract_probe'), 'Detect PERMISSIVE only');
create schema evil_probe;
create function evil_probe.account_required_mfa_satisfied() returns boolean language sql as 'select true';
drop policy account_required_mfa on public.mfa_contract_probe;
create policy account_required_mfa on public.mfa_contract_probe as restrictive for all to authenticated
using((select evil_probe.account_required_mfa_satisfied())) with check((select evil_probe.account_required_mfa_satisfied()));
select ok(exists(select 1 from mfa_coverage_violations where relname='mfa_contract_probe'), 'Detect look-alike function');
create table private.mfa_private_probe(id int);
grant select on private.mfa_private_probe to authenticated;
alter table private.mfa_private_probe enable row level security;
create policy mfa_guard on private.mfa_private_probe as restrictive for all to authenticated
using((select public.account_required_mfa_satisfied())) with check((select public.account_required_mfa_satisfied()));
select ok(exists(select 1 from mfa_coverage_violations where relname='mfa_private_probe'), 'Detect canonical expression under a different policy name');
create table public.mfa_column_probe(id int, note text);
grant select (note) on public.mfa_column_probe to authenticated;
select ok(exists(select 1 from mfa_coverage_violations where relname='mfa_column_probe'), 'Detect column-level client grant');
create table public.mfa_denyall_probe(id int);
grant all on public.mfa_denyall_probe to anon, authenticated;
alter table public.mfa_denyall_probe enable row level security;
select ok(not exists(select 1 from mfa_coverage_violations where relname='mfa_denyall_probe'), 'Accept RLS with no policy (default deny)');
create table public.mfa_unreachable_probe(id int);
revoke all on public.mfa_unreachable_probe from public, anon, authenticated;
select ok(not exists(select 1 from mfa_coverage_violations where relname='mfa_unreachable_probe'), 'Ignore a table without client privileges');
create view public.mfa_view_probe as select 1 as id;
grant select on public.mfa_view_probe to authenticated;
select ok(exists(select 1 from mfa_coverage_violations where relname='mfa_view_probe'), 'Detect mfa_view_probe');
create view public.mfa_view_off_probe with (security_invoker = off) as select 1 as id;
grant select on public.mfa_view_off_probe to authenticated;
select ok(exists(select 1 from mfa_coverage_violations where relname='mfa_view_off_probe'), 'Detect security_invoker = off view');
create view public.mfa_view_on_probe with (security_invoker = on) as select 1 as id;
grant select on public.mfa_view_on_probe to authenticated;
select ok(not exists(select 1 from mfa_coverage_violations where relname='mfa_view_on_probe'), 'Accept security_invoker = on view');
create view public.mfa_view_true_probe with (security_invoker = true) as select 1 as id;
grant select on public.mfa_view_true_probe to authenticated;
select ok(not exists(select 1 from mfa_coverage_violations where relname='mfa_view_true_probe'), 'Accept security_invoker = true view');
create materialized view public.mfa_matview_probe as select 1 as id;
grant select on public.mfa_matview_probe to authenticated;
select ok(exists(select 1 from mfa_coverage_violations where relname='mfa_matview_probe'), 'Detect mfa_matview_probe');
create materialized view private.mfa_matview_private_probe as select 1 as id;
revoke all on private.mfa_matview_private_probe from public, anon, authenticated;
select ok(not exists(select 1 from mfa_coverage_violations where relname='mfa_matview_private_probe'), 'Ignore a materialized view without client privileges');
create table public.mfa_parent_probe(id int) partition by range(id); create table public.mfa_partition_probe partition of public.mfa_parent_probe for values from (0) to (10);
grant all on public.mfa_partition_probe to authenticated;
select ok(exists(select 1 from mfa_coverage_violations where relname='mfa_partition_probe'), 'Detect mfa_partition_probe');
-- Platform-owned schemas: only a superuser (the contract runner) may create or
-- alter objects there. Plain `supabase test db` runs as postgres, where these
-- probes are skipped and the scope assertion above still pins the schemas.
create temporary table mfa_platform_probes(nspname text, relname text, created boolean);
do $$
declare s text;
begin
  foreach s in array array['graphql_public', 'storage'] loop
    begin
      execute format('create table %I.mfa_%s_probe(id int)', s, s);
      execute format('grant all on %I.mfa_%s_probe to authenticated', s, s);
      insert into mfa_platform_probes values (s, 'mfa_' || s || '_probe', true);
    exception when insufficient_privilege then
      insert into mfa_platform_probes values (s, null, false);
    end;
  end loop;
  begin
    drop policy account_required_mfa on realtime.messages;
    insert into mfa_platform_probes values ('realtime', 'messages', true);
  exception when insufficient_privilege then
    insert into mfa_platform_probes values ('realtime', 'messages', false);
  end;
end;
$$;
select ok(not exists(select 1 from mfa_platform_probes p where p.created
 and not exists (select 1 from mfa_coverage_violations v where v.nspname = p.nspname and v.relname = p.relname)),
 'Detect uncovered graphql_public and storage tables and a realtime.messages missing its policy');
create table public.mfa_exempt_probe(id int, note text);
grant select (note), update (note) on public.mfa_exempt_probe to authenticated;
insert into mfa_exemptions values ('public', 'mfa_exempt_probe', 'SR-1', 'fixture');
select ok(exists(select 1 from mfa_exemption_violations where relname='mfa_exempt_probe'), 'Detect column-level write grant on an exempt relation');
revoke all on public.mfa_exempt_probe from authenticated;
update mfa_exemptions set tracking_ref = 'later' where relname = 'mfa_exempt_probe';
select ok(exists(select 1 from mfa_exemption_violations where relname='mfa_exempt_probe'), 'Detect an exemption without a tracking reference');
drop policy account_required_mfa on public.mfa_contract_probe;
create policy account_required_mfa on public.mfa_contract_probe as restrictive for all to authenticated
using((select public.account_required_mfa_satisfied())) with check((select public.account_required_mfa_satisfied()));
select ok(not exists(select 1 from mfa_coverage_violations where relname='mfa_contract_probe'), 'Accept canonical policy');
rollback to broken_coverage;
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'account_required_mfa'), 1::bigint, 'Storage access receives the same policy');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'private' and c.relname = 'product_feedback_receipts'), 'private.product_feedback_receipts has row level security enabled');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000009999","role":"authenticated","aal":"aal2"}', true);
select ok(not public.account_required_mfa_satisfied(), 'Deleted or missing auth account cannot retain database access');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select ok(not public.account_required_mfa_satisfied(), 'Authenticated role without actor is rejected');
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select ok(public.account_required_mfa_satisfied(), 'Anonymous access still depends on ordinary grants and RLS');
update auth.users set raw_app_meta_data = '{"tuturuuu_required_mfa":{"required":true,"verifiedAfter":9007199254740991}}' where id = '00000000-0000-4000-8000-000000009901';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000009901","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-000000009903"}', true);
select ok(not public.account_required_mfa_satisfied(), 'Large safe integer boundary fails closed without timestamp overflow');
update auth.users set raw_app_meta_data = '{"tuturuuu_required_mfa":{"required":true,"verifiedAfter":102,"primaryVerifiedAfter":102,"recoveryInProgress":true}}' where id = '00000000-0000-4000-8000-000000009901';
select ok(public.account_mfa_verified_factor('00000000-0000-4000-8000-000000009901','00000000-0000-4000-8000-000000009903',104,103) is null, 'Recovery in progress refuses newly completed proofs');
update auth.users set raw_app_meta_data = '{"tuturuuu_required_mfa":{"required":true,"verifiedAfter":102,"primaryVerifiedAfter":102}}' where id = '00000000-0000-4000-8000-000000009901';
select ok(public.account_mfa_verified_factor('00000000-0000-4000-8000-000000009901','00000000-0000-4000-8000-000000009903',104,101) is null, 'Old primary session cannot become valid by verifying a new factor');
select is(public.account_mfa_verified_factor('00000000-0000-4000-8000-000000009901','00000000-0000-4000-8000-000000009903',104,103), '00000000-0000-4000-8000-000000009904'::uuid, 'Fresh primary and verified factor retain exact lineage');
update public.qr_login_challenges set approved_at=now(), approval_metadata=jsonb_build_object('approverSessionId','00000000-0000-4000-8000-000000009903','mobileMfaValidUntil',now()+interval '5 minutes','requiredMfaProof',jsonb_build_object('sessionId','00000000-0000-4000-8000-000000009903','factorId','00000000-0000-4000-8000-000000009904','verifiedAt',104,'primaryVerifiedAt',103)) where id='00000000-0000-4000-8000-000000009902';
select ok(not public.account_required_mfa_satisfied(), 'Fresh mobile approval cannot revive requester primary session predating recovery');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000009901","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-000000009903","amr":[{"method":"password","timestamp":103}]}', true);
select ok(public.account_required_mfa_satisfied(), 'Fresh requester primary and current approving factor permit mobile approval');
delete from auth.mfa_factors where id='00000000-0000-4000-8000-000000009904';
select ok(public.account_mfa_verified_factor('00000000-0000-4000-8000-000000009901','00000000-0000-4000-8000-000000009903',104,103) is null, 'Late completion pointing at a removed factor fails closed');
insert into auth.mfa_factors (id,user_id,factor_type,status,created_at,updated_at) values ('00000000-0000-4000-8000-000000009905','00000000-0000-4000-8000-000000009901','totp','verified',to_timestamp(103),to_timestamp(103));
update auth.sessions set factor_id='00000000-0000-4000-8000-000000009905' where id='00000000-0000-4000-8000-000000009903';
select isnt(public.account_mfa_verified_factor('00000000-0000-4000-8000-000000009901','00000000-0000-4000-8000-000000009903',104,103), '00000000-0000-4000-8000-000000009904'::uuid, 'New enrollment cannot reproduce removed factor lineage');
select ok(not has_function_privilege('authenticated','public.account_mfa_verified_factor(uuid,text,bigint,bigint)','EXECUTE'), 'Factor lineage probe is service-only');
create temporary table recovery_snapshot(policy jsonb);
insert into recovery_snapshot select public.transition_account_mfa_policy('00000000-0000-4000-8000-000000009901', (select raw_app_meta_data -> 'tuturuuu_required_mfa' from auth.users where id='00000000-0000-4000-8000-000000009901'), '{"required":true,"recoveryInProgress":true,"primaryVerifiedAfter":0}', true);
select public.transition_account_mfa_policy('00000000-0000-4000-8000-000000009901', (select policy from recovery_snapshot), '{"required":true,"recoveryInProgress":true,"primaryVerifiedAfter":0}', false);
select throws_ok($$select public.transition_account_mfa_policy('00000000-0000-4000-8000-000000009901', (select policy from recovery_snapshot), '{"required":true,"recoveryInProgress":false,"primaryVerifiedAfter":0}', false)$$, '40001', 'Account security changed concurrently', 'Stalled old completion cannot overwrite newer recovery generation');
select ok((select raw_app_meta_data #>> '{tuturuuu_required_mfa,recoveryInProgress}' = 'true' from auth.users where id='00000000-0000-4000-8000-000000009901'), 'New recovery remains blocked after stale completion');
select ok((select raw_app_meta_data #> '{tuturuuu_device_authenticators,devices}' = '[]'::jsonb from auth.users where id='00000000-0000-4000-8000-000000009901'), 'Recovery atomically clears trusted-device proofs');
select ok(not has_function_privilege('authenticated','public.transition_account_mfa_policy(uuid,jsonb,jsonb,boolean)','EXECUTE'), 'Policy transition is service-only');
select * from finish();
rollback;
