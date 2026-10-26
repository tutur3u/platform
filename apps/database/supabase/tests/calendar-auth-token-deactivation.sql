begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);

insert into auth.users(id) values ('00000000-0000-4000-8000-000000008801');
insert into public.users(id) values ('00000000-0000-4000-8000-000000008801') on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id)
values ('00000000-0000-4000-8000-000000008811', 'Token quarantine fixture', false, '00000000-0000-4000-8000-000000008801');
insert into public.calendar_auth_tokens(id, user_id, ws_id, provider, access_token, refresh_token, is_active, created_at)
values
  ('00000000-0000-4000-8000-000000008821', '00000000-0000-4000-8000-000000008801', '00000000-0000-4000-8000-000000008811', 'google', 'fixture-access', 'fixture-refresh-a', true, '2026-10-26T00:00:00.123456Z'),
  ('00000000-0000-4000-8000-000000008822', '00000000-0000-4000-8000-000000008801', '00000000-0000-4000-8000-000000008811', 'microsoft', 'fixture-access', 'fixture-refresh-b', true, '2026-10-26T00:00:00.123456Z');

create function pg_temp.fp(value text) returns text language sql as $$
  select encode(sha256(convert_to(value, 'UTF8')), 'hex')
$$;
create function pg_temp.quarantine(token uuid, fingerprint text, observed timestamptz, reason text) returns text language sql as $$
  select public.quarantine_calendar_auth_token(token, '00000000-0000-4000-8000-000000008811', fingerprint, observed, reason)
$$;

-- Schema shape: additive columns, validated checks, table access unchanged.
select has_column('public', 'calendar_auth_tokens', 'deactivated_reason', 'reason column exists');
select has_column('public', 'calendar_auth_tokens', 'deactivated_at', 'timestamp column exists');
select ok(
  (select bool_and(convalidated) and count(*) = 3 from pg_constraint
   where conrelid = 'public.calendar_auth_tokens'::regclass
     and conname in ('calendar_auth_tokens_deactivated_reason_check', 'calendar_auth_tokens_deactivation_pair_check', 'calendar_auth_tokens_active_not_deactivated_check')),
  'all three quarantine checks are validated'
);
select ok((select relrowsecurity from pg_class where oid = 'public.calendar_auth_tokens'::regclass), 'table RLS stays enabled');
select ok(not has_function_privilege('anon', 'public.quarantine_calendar_auth_token(uuid,uuid,text,timestamptz,text)', 'EXECUTE'), 'anon cannot quarantine');
select ok(not has_function_privilege('authenticated', 'public.quarantine_calendar_auth_token(uuid,uuid,text,timestamptz,text)', 'EXECUTE'), 'authenticated cannot quarantine');
select ok(has_function_privilege('service_role', 'public.quarantine_calendar_auth_token(uuid,uuid,text,timestamptz,text)', 'EXECUTE'), 'service role can quarantine');

-- The CHECK guards the inactive shape.
select throws_ok(
  $$update public.calendar_auth_tokens set is_active = false, deactivated_reason = 'not_a_code', deactivated_at = now() where id = '00000000-0000-4000-8000-000000008822'$$,
  '23514', null, 'unknown reason codes are rejected'
);
select throws_ok(
  $$update public.calendar_auth_tokens set is_active = false, deactivated_reason = 'microsoft_invalid_grant' where id = '00000000-0000-4000-8000-000000008822'$$,
  '23514', null, 'a reason without a timestamp is rejected'
);

-- Fences: a changed credential or a newer reconnect is never clobbered.
select is(pg_temp.quarantine('00000000-0000-4000-8000-000000008821', pg_temp.fp('rotated-refresh'), '2026-10-26T00:00:00.123456Z', 'google_invalid_grant'), 'fenced', 'a different credential fingerprint is fenced');
select is(pg_temp.quarantine('00000000-0000-4000-8000-000000008821', pg_temp.fp('fixture-refresh-a'), '2026-10-26T00:00:01Z', 'google_invalid_grant'), 'fenced', 'a reconnect that reused the refresh token is fenced by created_at');
select is((select is_active from public.calendar_auth_tokens where id = '00000000-0000-4000-8000-000000008821'), true, 'fenced attempts leave the row active');
select is(pg_temp.quarantine('00000000-0000-4000-8000-000000008899', pg_temp.fp('fixture-refresh-a'), '2026-10-26T00:00:00.123456Z', 'google_invalid_grant'), 'fenced', 'a missing row is fenced');

-- Quarantine and idempotency.
select is(pg_temp.quarantine('00000000-0000-4000-8000-000000008821', pg_temp.fp('fixture-refresh-a'), '2026-10-26T00:00:00.123456Z', 'google_invalid_grant'), 'deactivated', 'a matching credential is quarantined');
select results_eq(
  $$select is_active, deactivated_reason, deactivated_at is not null, refresh_token from public.calendar_auth_tokens where id = '00000000-0000-4000-8000-000000008821'$$,
  $$values (false, 'google_invalid_grant'::text, true, 'fixture-refresh-a'::text)$$,
  'quarantine records the reason and keeps the credential row'
);
create temp table first_quarantine as
  select deactivated_at from public.calendar_auth_tokens where id = '00000000-0000-4000-8000-000000008821';
select is(pg_temp.quarantine('00000000-0000-4000-8000-000000008821', pg_temp.fp('fixture-refresh-a'), '2026-10-26T00:00:00.123456Z', 'google_invalid_grant'), 'already_inactive', 'a repeated quarantine is idempotent');
select is((select deactivated_at from public.calendar_auth_tokens where id = '00000000-0000-4000-8000-000000008821'), (select deactivated_at from first_quarantine), 'a repeated quarantine keeps the first timestamp');
select is(pg_temp.quarantine('00000000-0000-4000-8000-000000008822', pg_temp.fp('fixture-refresh-b'), '2026-10-26T00:00:00.123456Z', 'unknown_permanent'), 'deactivated', 'the catch-all permanent code is accepted');
select is(pg_temp.quarantine('00000000-0000-4000-8000-000000008822', pg_temp.fp('fixture-refresh-b'), '2026-10-26T00:00:00.123456Z', 'microsoft_invalid_grant'), 'already_inactive', 'a later quarantine of an inactive row is a no-op');
select is((select deactivated_reason from public.calendar_auth_tokens where id = '00000000-0000-4000-8000-000000008822'), 'unknown_permanent', 'a later quarantine cannot rewrite the first reason');

-- The reconnect callback's own UPDATE clears both fields without the trigger.
alter table public.calendar_auth_tokens disable trigger calendar_auth_tokens_clear_deactivation;
select throws_ok(
  $$update public.calendar_auth_tokens set is_active = true where id = '00000000-0000-4000-8000-000000008822'$$,
  '23514', null, 'without the trigger, an is_active-only reactivation is rejected'
);
select lives_ok(
  $$update public.calendar_auth_tokens set refresh_token = 'fixture-refresh-c', is_active = true, created_at = now(), deactivated_reason = null, deactivated_at = null where id = '00000000-0000-4000-8000-000000008822'$$,
  'the callback-shaped reconnect clears both fields itself'
);
alter table public.calendar_auth_tokens enable trigger calendar_auth_tokens_clear_deactivation;
select results_eq(
  $$select is_active, deactivated_reason, deactivated_at from public.calendar_auth_tokens where id = '00000000-0000-4000-8000-000000008822'$$,
  $$values (true, null::text, null::timestamptz)$$,
  'reconnect reactivates the same row with cleared fields'
);

-- The trigger is the guarantee for active rows, including the retained
-- callback that only sets is_active, run as the owning user.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000008801', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000008801","role":"authenticated"}', true);
set local role authenticated;
update public.calendar_auth_tokens set is_active = true, created_at = now() where id = '00000000-0000-4000-8000-000000008821';
reset role;
select results_eq(
  $$select is_active, deactivated_reason, deactivated_at from public.calendar_auth_tokens where id = '00000000-0000-4000-8000-000000008821'$$,
  $$values (true, null::text, null::timestamptz)$$,
  'a legacy is_active-only reconnect by the owner is normalized by the trigger'
);

select * from finish();
rollback;
