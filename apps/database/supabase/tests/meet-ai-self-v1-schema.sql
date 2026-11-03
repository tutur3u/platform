-- Meet AI self_v1 PR 1: privileges, legacy upgrade semantics, invariants and
-- N2 delete cascades on the merged #7264/#7276/#7293 schema.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select set_config('request.jwt.claims', '{}', true);
create function pg_temp.cid(n integer) returns uuid language sql as $$
 select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;

-- Service-only tables and functions.
select ok((select bool_and(c.relrowsecurity) from pg_class c where c.oid in (
  'private.meet_ai_session_participants'::regclass, 'private.meet_ai_capture_streams'::regclass,
  'private.meet_ai_erasure_jobs'::regclass, 'private.meet_ai_account_fences'::regclass)),
  'every new self_v1 table enables RLS');
select ok(not exists (
  select 1 from unnest(array['private.meet_ai_session_participants', 'private.meet_ai_capture_streams',
    'private.meet_ai_erasure_jobs', 'private.meet_ai_account_fences']) t(name)
  cross join unnest(array['anon', 'authenticated']) r(role)
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p(priv)
  where has_table_privilege(r.role, t.name, p.priv)), 'anon and authenticated have no direct table access');
select ok(not has_column_privilege('authenticated', 'public.meet_ai_sessions', 'share_notes_live', 'SELECT')
  and not has_column_privilege('authenticated', 'public.meet_ai_chunks', 'account_id', 'SELECT'),
  '#7293 revoked direct session/chunk SELECT stays revoked for new columns');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join unnest(array['public', 'anon', 'authenticated']) r(role)
  where n.nspname = 'private' and (p.proname like '%meet_ai_self_v1%'
      or p.proname in ('guard_meet_ai_session', 'guard_meet_ai_participant',
        'guard_meet_ai_capture_stream', 'guard_meet_ai_chunk'))
    and (case when r.role = 'public'
      then exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE')
      else has_function_privilege(r.role, p.oid, 'EXECUTE') end)),
  'no new function is executable by PUBLIC, anon or authenticated');
select ok((select bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE')
    and exists (select 1 from unnest(p.proconfig) cfg where cfg = 'search_path=pg_catalog, pg_temp'))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname like '%meet_ai_self_v1%'),
  'self_v1 functions are service-executable with an explicit pg_temp-last path');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname like '%meet_ai_self_v1%'), 10, 'ten self_v1 functions exist');

-- N2 FK actions are explicit.
select is((select confdeltype::text from pg_constraint where conname = 'meet_ai_sessions_user_id_fkey'), 'n',
  'host profile deletion sets session user_id NULL instead of blocking');
select is((select confdeltype::text from pg_constraint where conname = 'meet_ai_sessions_billing_host_id_fkey'), 'n',
  'payer reference is SET NULL and nonauthorizing');
select is((select string_agg(confdeltype::text, '' order by conname) from pg_constraint
  where conname in ('meet_ai_chunks_account_id_fkey', 'meet_ai_chunks_stream_fkey')), 'cc',
  'chunk account and stream references cascade');
select is((select confdeltype::text from pg_constraint where conname = 'meet_ai_consents_session_id_fkey'), 'r',
  '#7264 consent RESTRICT FK is preserved, not silently changed');
select ok(not exists (select 1 from pg_constraint where conrelid = 'public.meet_ai_sessions'::regclass and not convalidated)
  and not exists (select 1 from pg_constraint where conrelid = 'public.meet_ai_chunks'::regclass and not convalidated),
  'all self_v1 constraints are validated');
select ok(not exists (select 1 from pg_constraint where conname = 'meet_ai_chunks_session_id_sequence_key'),
  'global chunk sequence key replaced by legacy and per-stream keys');

-- Fixture: creator C, host H, participants P/Q, nonmember external X.
insert into auth.users(id) select pg_temp.cid(n) from generate_series(89001, 89005) n;
insert into public.users(id) select pg_temp.cid(n) from generate_series(89001, 89005) n on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id) values
 (pg_temp.cid(89011), 'Self capture', false, pg_temp.cid(89001)),
 (pg_temp.cid(89012), 'Other', false, pg_temp.cid(89001));
insert into public.workspace_members(ws_id, user_id, type) values
 (pg_temp.cid(89011), pg_temp.cid(89002), 'MEMBER'), (pg_temp.cid(89011), pg_temp.cid(89003), 'MEMBER')
 on conflict do nothing;
insert into public.workspace_meetings(id, ws_id, creator_id, name) values
 (pg_temp.cid(89021), pg_temp.cid(89011), pg_temp.cid(89001), 'Self'),
 (pg_temp.cid(89022), pg_temp.cid(89011), pg_temp.cid(89001), 'Legacy'),
 (pg_temp.cid(89023), pg_temp.cid(89011), pg_temp.cid(89001), 'Guards');

-- Upgrade semantics: a row written the pre-PR way stays legacy.
insert into public.meet_ai_sessions(id, meeting_id, user_id) values
 (pg_temp.cid(89031), pg_temp.cid(89022), pg_temp.cid(89002));
select is((select protocol || '/' || coalesce(capture_state, 'null') || '/' || share_notes_live::text
  || '/' || share_notes_after::text from public.meet_ai_sessions where id = pg_temp.cid(89031)),
  'legacy/null/false/false', 'existing writers create legacy, unshared sessions');
select throws_ok($$update public.meet_ai_sessions set protocol = 'self_v1' where id = pg_temp.cid(89031)$$,
  '55000', null, 'legacy sessions can never be relabelled as self-capture');
select throws_ok($$update public.meet_ai_sessions set share_notes_live = true where id = pg_temp.cid(89031)$$,
  '23514', null, 'legacy sessions cannot carry self_v1 sharing');
select lives_ok($$select public.reserve_meet_ai_chunk(pg_temp.cid(89041), pg_temp.cid(89031), 0, 0, 10)$$,
  'legacy reservation RPC still reserves legacy chunks');
select throws_ok($$insert into public.meet_ai_chunks(id, session_id, sequence, start_seconds, duration_seconds)
  values (pg_temp.cid(89042), pg_temp.cid(89031), 0, 0, 10)$$, '23505', null,
  'legacy global (session, sequence) identity is preserved');
select is((select count(*)::int from public.meet_ai_chunks where session_id = pg_temp.cid(89031) and stream_id is null), 1,
  'legacy chunk keeps NULL self_v1 provenance');

-- self_v1 insert guards.
select throws_ok($$insert into public.meet_ai_sessions(meeting_id, user_id, protocol, billing_ws_id, billing_host_id)
  values (pg_temp.cid(89023), pg_temp.cid(89002), 'self_v1', pg_temp.cid(89011), pg_temp.cid(89003))$$,
  '23514', 'self_v1 payer must be the session host', 'payer cannot differ from the host');
select throws_ok($$insert into public.meet_ai_sessions(meeting_id, user_id, protocol, billing_ws_id, billing_host_id)
  values (pg_temp.cid(89023), pg_temp.cid(89002), 'self_v1', pg_temp.cid(89012), pg_temp.cid(89002))$$,
  '23514', 'self_v1 payer workspace must own the meeting', 'route or other workspace cannot be the payer');
select throws_ok($$insert into public.meet_ai_sessions(meeting_id, user_id, protocol, billing_ws_id, billing_host_id, visibility)
  values (pg_temp.cid(89023), pg_temp.cid(89002), 'self_v1', pg_temp.cid(89011), pg_temp.cid(89002), 'workspace')$$,
  '23514', null, 'self_v1 rejects workspace visibility');
select throws_ok($$insert into public.meet_ai_sessions(meeting_id, user_id, protocol, billing_ws_id, billing_host_id, purge_after)
  values (pg_temp.cid(89023), pg_temp.cid(89002), 'self_v1', pg_temp.cid(89011), pg_temp.cid(89002), null)$$,
  '23514', null, 'self_v1 cannot be retained forever');
select throws_ok($$insert into public.meet_ai_sessions(meeting_id, user_id, protocol, billing_ws_id, billing_host_id, purge_after)
  values (pg_temp.cid(89023), pg_temp.cid(89002), 'self_v1', pg_temp.cid(89011), pg_temp.cid(89002), now() + interval '366 days')$$,
  '23514', null, 'self_v1 retention is at most 365 days');
select throws_ok($$insert into public.meet_ai_sessions(meeting_id, user_id, protocol, billing_ws_id, billing_host_id, capture_deadline_at)
  values (pg_temp.cid(89023), pg_temp.cid(89002), 'self_v1', pg_temp.cid(89011), pg_temp.cid(89002), now() + interval '4 hours')$$,
  '23514', null, 'self_v1 capture lifetime is at most 3 hours');
select throws_ok($$insert into public.meet_ai_sessions(meeting_id, user_id, protocol, billing_ws_id, billing_host_id, share_notes_after)
  values (pg_temp.cid(89023), pg_temp.cid(89002), 'self_v1', pg_temp.cid(89011), pg_temp.cid(89002), true)$$,
  '23514', null, 'self_v1 sessions start unshared (default-off)');
insert into public.meet_ai_sessions(id, meeting_id, user_id, protocol, billing_ws_id, billing_host_id) values
 (pg_temp.cid(89032), pg_temp.cid(89021), pg_temp.cid(89002), 'self_v1', pg_temp.cid(89011), pg_temp.cid(89002));
select is((select capture_state || '/' || (capture_deadline_at = created_at + interval '3 hours')::text
  || '/' || visibility from public.meet_ai_sessions where id = pg_temp.cid(89032)),
  'active/true/host', 'self_v1 defaults: active, 3-hour deadline, host-only visibility');

-- self_v1 update guards.
select throws_ok($$update public.meet_ai_sessions set purge_after = purge_after + interval '1 day' where id = pg_temp.cid(89032)$$,
  '55000', null, 'retention deadline cannot be extended');
select throws_ok($$update public.meet_ai_sessions set billing_host_id = pg_temp.cid(89003) where id = pg_temp.cid(89032)$$,
  '55000', null, 'no payer takeover during a session');
select throws_ok($$update public.meet_ai_sessions set share_notes_live = true where id = pg_temp.cid(89032)$$,
  '55000', null, 'sharing changes require a new durable revision');
select throws_ok($$update public.meet_ai_sessions set visibility = 'workspace' where id = pg_temp.cid(89032)$$,
  '23514', null, 'workspace visibility cannot be set later either');
select throws_ok($$update public.meet_ai_sessions set notes_provider_attempts = 4 where id = pg_temp.cid(89032)$$,
  '23514', null, 'one notes budget: at most three provider attempts');
select throws_ok($$update public.meet_ai_sessions set notes_deliveries = 7 where id = pg_temp.cid(89032)$$,
  '23514', null, 'finalizer delivery budget is at most six');
select throws_ok($$update public.meet_ai_sessions set cost_cap_usd = 21 where id = pg_temp.cid(89032)$$,
  '23514', null, 'session cost cap can only be lowered from USD 20');
select throws_ok($$update public.meet_ai_sessions set ended_at = now() where id = pg_temp.cid(89032)$$,
  '23514', null, 'ended_at is set only once capture closes');
select throws_ok($$update public.meet_ai_sessions set capture_state = 'draining', cutoff_at = now(), drain_deadline_at = now() + interval '21 seconds' where id = pg_temp.cid(89032)$$,
  '23514', null, 'drain is bounded to 20 seconds after cutoff');

-- Admission, streams and chunks.
select throws_ok($$insert into private.meet_ai_session_participants(session_id, account_id, first_admitted_generation, last_admitted_generation)
  values (pg_temp.cid(89031), pg_temp.cid(89003), 1, 1)$$, '23514', null, 'legacy sessions get no admission records');
set local role service_role;
select lives_ok($$select private.record_meet_ai_self_v1_admission(pg_temp.cid(89032), pg_temp.cid(n), 1)
  from generate_series(89002, 89004) n$$, 'room authority records actual admissions');
reset role;
select throws_ok($$insert into private.meet_ai_capture_streams(session_id, account_id, device_epoch, input_processing, lease_expires_at)
  values (pg_temp.cid(89032), pg_temp.cid(89005), 1, 'processed_aec', now() + interval '30 seconds')$$,
  '55000', null, 'never-admitted accounts cannot open streams');
select throws_ok($$insert into private.meet_ai_capture_streams(session_id, account_id, device_epoch, input_processing, lease_expires_at)
  values (pg_temp.cid(89032), pg_temp.cid(89003), 1, 'raw', now() + interval '30 seconds')$$,
  '23514', null, 'only processed AEC input is accepted');
insert into private.meet_ai_capture_streams(id, session_id, account_id, device_epoch, input_processing, lease_expires_at) values
 (pg_temp.cid(89051), pg_temp.cid(89032), pg_temp.cid(89003), 1, 'processed_aec', now() + interval '30 seconds'),
 (pg_temp.cid(89052), pg_temp.cid(89032), pg_temp.cid(89004), 1, 'processed_aec', now() + interval '30 seconds');
select throws_ok($$insert into private.meet_ai_capture_streams(session_id, account_id, device_epoch, input_processing, lease_expires_at)
  values (pg_temp.cid(89032), pg_temp.cid(89003), 2, 'processed_aec', now() + interval '30 seconds')$$,
  '23505', null, 'one live device stream per account');
update private.meet_ai_capture_streams set state = 'revoked', closed_at = now() where id = pg_temp.cid(89051);
select throws_ok($$insert into private.meet_ai_capture_streams(session_id, account_id, device_epoch, input_processing, lease_expires_at)
  values (pg_temp.cid(89032), pg_temp.cid(89003), 1, 'processed_aec', now() + interval '30 seconds')$$,
  '23514', null, 'takeover allocates a strictly newer device epoch');
select throws_ok($$update private.meet_ai_capture_streams set state = 'active', closed_at = null where id = pg_temp.cid(89051)$$,
  '55000', null, 'revoked streams stay terminal');
create function pg_temp.self_chunk(chunk integer, stream integer, account integer, seq integer, start_ms bigint)
returns void language sql as $$
  insert into public.meet_ai_chunks(id, session_id, sequence, start_seconds, duration_seconds, status, transcript,
    stream_id, account_id, source_kind, content_digest, start_ms, end_ms, timing_uncertainty_ms, start_sample,
    capture_consent_revision, erase_generation, transcript_revision)
  values (pg_temp.cid(chunk), pg_temp.cid(89032), seq, start_ms / 1000.0, 10, 'completed', 'text ' || chunk,
    pg_temp.cid(stream), pg_temp.cid(account), 'microphone', sha256(chunk::text::bytea), start_ms, start_ms + 10000,
    100, start_ms * 16, 1, 0, 0);
$$;
select lives_ok($$select pg_temp.self_chunk(89061, 89051, 89003, 0, 0); select pg_temp.self_chunk(89062, 89052, 89004, 0, 0)$$,
  'two participants may both upload sequence 0');
select throws_ok($$select pg_temp.self_chunk(89063, 89051, 89003, 0, 5000)$$, '23505', null,
  'per-stream sequence identity is unique');
select throws_ok($$select pg_temp.self_chunk(89064, 89051, 89004, 1, 5000)$$, '23503', null,
  'a stream id never attributes speech to another account');
select throws_ok($$insert into public.meet_ai_chunks(id, session_id, sequence, start_seconds, duration_seconds)
  values (pg_temp.cid(89065), pg_temp.cid(89032), 7, 0, 10)$$, '23514', null,
  'legacy-shaped chunks cannot enter a self_v1 session');
select throws_ok($$select public.reserve_meet_ai_chunk(pg_temp.cid(89066), pg_temp.cid(89032), 5, 0, 10)$$,
  '55000', null, 'legacy reservation RPC refuses self_v1 sessions');
select throws_ok($$update public.meet_ai_chunks set account_id = pg_temp.cid(89004) where id = pg_temp.cid(89061)$$,
  '55000', null, 'self_v1 speaker provenance is immutable');

-- N2: one 24-account cap per session; workspace deletion with self_v1 consent succeeds.
insert into auth.users(id) select pg_temp.cid(n) from generate_series(89101, 89125) n;
insert into public.users(id) select pg_temp.cid(n) from generate_series(89101, 89125) n on conflict do nothing;
set local role service_role;
select lives_ok($$select private.record_meet_ai_self_v1_admission(pg_temp.cid(89032), pg_temp.cid(n), 1)
  from generate_series(89101, 89121) n$$, 'admissions up to 24 accounts succeed');
select throws_ok($$select private.record_meet_ai_self_v1_admission(pg_temp.cid(89032), pg_temp.cid(89122), 1)$$,
  '54000', null, 'the 25th account is refused');
select lives_ok($$select private.record_meet_ai_self_v1_admission(pg_temp.cid(89032), pg_temp.cid(89003), 1)$$,
  're-admission of an existing account is not blocked by the cap');
insert into private.meet_ai_consents(session_id, user_id, decision, notice_version) values
 (pg_temp.cid(89032), pg_temp.cid(89003), 'allow', 'v1'), (pg_temp.cid(89032), pg_temp.cid(89004), 'deny', 'v1');
reset role;
-- Host profile hard deletion (after Auth deletion removed memberships, as in
-- production erasure) keeps the session and everyone else's speech.
delete from auth.users where id = pg_temp.cid(89002);
delete from public.workspaces where creator_id = pg_temp.cid(89002) and personal;
set local role service_role;
select lives_ok($$delete from public.users where id = pg_temp.cid(89002)$$, 'host profile deletion is not blocked');
reset role;
select ok((select user_id is null and billing_host_id is null from public.meet_ai_sessions where id = pg_temp.cid(89032)),
  'session survives with a nonauthorizing NULL host and payer');
select is((select count(*)::int from public.meet_ai_chunks where session_id = pg_temp.cid(89032)), 2,
  'participants keep their own speech after host deletion');
set local role service_role;
insert into private.meet_ai_consents(session_id, user_id, decision, notice_version) values (pg_temp.cid(89031), pg_temp.cid(89003), 'allow', 'v1');
reset role;
select throws_ok($$delete from public.workspace_meetings where id = pg_temp.cid(89022)$$, '23503', null,
  'legacy consent evidence still needs explicit erasure first (#7264 policy kept)');
set local role service_role;
delete from private.meet_ai_consents where session_id = pg_temp.cid(89031);
reset role;
select lives_ok($$delete from public.workspaces where id = pg_temp.cid(89011)$$,
  'workspace deletion with self_v1 consents succeeds');
select ok(not exists (select 1 from private.meet_ai_consents where session_id = pg_temp.cid(89032))
  and not exists (select 1 from private.meet_ai_session_participants where session_id = pg_temp.cid(89032))
  and not exists (select 1 from private.meet_ai_capture_streams where session_id = pg_temp.cid(89032))
  and not exists (select 1 from public.meet_ai_chunks where session_id in (pg_temp.cid(89031), pg_temp.cid(89032)))
  and not exists (select 1 from public.meet_ai_sessions where id in (pg_temp.cid(89031), pg_temp.cid(89032))),
  'workspace deletion leaves no orphaned consent, admission, stream, chunk or session rows');
select * from finish();
rollback;
