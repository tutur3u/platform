-- Meet AI self_v1 PR 1: consent is enforced in the database. The legal store
-- private.meet_ai_consents (#7264) is the only consent source: stream opens
-- and chunk writes need the participant's CURRENT decision to be `allow` at the
-- exact derived revision; withdrawal revokes live streams; re-admission never
-- restores a revoked upload grant; session deletion keeps consent evidence.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select set_config('request.jwt.claims', '{}', true);
create function pg_temp.cid(n integer) returns uuid language sql as $$
 select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
-- C creator, H host, A allow, D deny, N no decision, W withdraw, R re-admitted.
insert into auth.users(id) select pg_temp.cid(n) from generate_series(89301, 89307) n;
insert into public.users(id) select pg_temp.cid(n) from generate_series(89301, 89307) n on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id) values
 (pg_temp.cid(89311), 'Self consent', false, pg_temp.cid(89301));
insert into public.workspace_meetings(id, ws_id, creator_id, name) values
 (pg_temp.cid(89321), pg_temp.cid(89311), pg_temp.cid(89301), 'Consent'),
 (pg_temp.cid(89322), pg_temp.cid(89311), pg_temp.cid(89301), 'No evidence'),
 (pg_temp.cid(89323), pg_temp.cid(89311), pg_temp.cid(89301), 'Legacy consent');
insert into public.meet_ai_sessions(id, meeting_id, user_id, protocol, billing_ws_id, billing_host_id) values
 (pg_temp.cid(89331), pg_temp.cid(89321), pg_temp.cid(89302), 'self_v1', pg_temp.cid(89311), pg_temp.cid(89302)),
 (pg_temp.cid(89332), pg_temp.cid(89322), pg_temp.cid(89302), 'self_v1', pg_temp.cid(89311), pg_temp.cid(89302));
insert into public.meet_ai_sessions(id, meeting_id, user_id) values
 (pg_temp.cid(89333), pg_temp.cid(89323), pg_temp.cid(89302));
set local role service_role;
select private.record_meet_ai_self_v1_admission(pg_temp.cid(89331), pg_temp.cid(n), 1)
 from generate_series(89303, 89307) n;
select private.record_meet_ai_self_v1_admission(pg_temp.cid(89332), pg_temp.cid(89303), 1);
insert into private.meet_ai_consents(session_id, user_id, decision, notice_version) values
 (pg_temp.cid(89331), pg_temp.cid(89303), 'allow', 'v1'),
 (pg_temp.cid(89331), pg_temp.cid(89304), 'deny', 'v1'),
 (pg_temp.cid(89331), pg_temp.cid(89306), 'allow', 'v1'),
 (pg_temp.cid(89331), pg_temp.cid(89307), 'allow', 'v1');
reset role;
create function pg_temp.open_stream(stream integer, account integer, epoch integer)
returns void language sql as $$
  insert into private.meet_ai_capture_streams(id, session_id, account_id, device_epoch, input_processing, lease_expires_at)
  values (pg_temp.cid(stream), pg_temp.cid(89331), pg_temp.cid(account), epoch, 'processed_aec',
    now() + interval '30 seconds');
$$;
create function pg_temp.chunk(chunk integer, stream integer, account integer, seq integer, revision integer)
returns void language sql as $$
  insert into public.meet_ai_chunks(id, session_id, sequence, start_seconds, duration_seconds, status,
    stream_id, account_id, source_kind, content_digest, start_ms, end_ms, timing_uncertainty_ms, start_sample,
    capture_consent_revision, erase_generation, transcript_revision)
  values (pg_temp.cid(chunk), pg_temp.cid(89331), seq, seq * 10, 10, 'processing', pg_temp.cid(stream),
    pg_temp.cid(account), 'microphone', sha256(chunk::text::bytea), seq * 10000, seq * 10000 + 10000, 100,
    seq * 160000, revision, 0, 0);
$$;
create function pg_temp.revision_of(account integer) returns integer language sql as $$
  select p.consent_revision from private.meet_ai_session_participants p
  where p.session_id = pg_temp.cid(89331) and p.account_id = pg_temp.cid(account);
$$;
create function pg_temp.decide(account integer, decision text) returns void language sql as $$
  insert into private.meet_ai_consents(session_id, user_id, decision, notice_version)
  values (pg_temp.cid(89331), pg_temp.cid(account), decision, 'v1');
$$;

-- No decision and deny are refused before any audio exists.
select throws_ok($$select pg_temp.open_stream(89341, 89305, 1)$$, '55000', null,
  'an admitted participant with no consent decision cannot open a capture stream');
select throws_ok($$select pg_temp.open_stream(89342, 89304, 1)$$, '55000', null,
  'a participant whose current decision is deny cannot open a capture stream');

-- Allow path, at the exact revision derived from the legal store.
select is(pg_temp.revision_of(89303), 1, 'participant consent revision is derived from meet_ai_consents');
select lives_ok($$select pg_temp.open_stream(89343, 89303, 1)$$, 'current allow opens a capture stream');
select lives_ok($$select pg_temp.chunk(89351, 89343, 89303, 0, 1)$$, 'chunk at the current allow revision is stored');
select throws_ok($$select pg_temp.chunk(89352, 89343, 89303, 1, 2)$$, '55000', null,
  'a chunk claiming a revision the participant does not hold is refused');
select throws_ok($$update private.meet_ai_session_participants set consent_revision = 5
  where session_id = pg_temp.cid(89331) and account_id = pg_temp.cid(89303)$$, '55000', null,
  'the participant consent revision is never independently writable');
select is(pg_temp.revision_of(89305), 0, 'no decision derives revision 0');

-- Withdraw: the live stream is revoked and every later write is refused.
select lives_ok($$select pg_temp.open_stream(89344, 89306, 1); select pg_temp.chunk(89353, 89344, 89306, 0, 1)$$,
  'allowed participant captures before withdrawing');
set local role service_role;
select pg_temp.decide(89306, 'withdraw');
reset role;
select is((select state from private.meet_ai_capture_streams where id = pg_temp.cid(89344)), 'revoked',
  'withdrawal revokes the live capture stream in the same transaction');
select is(pg_temp.revision_of(89306), 2, 'withdrawal advances the derived revision');
select throws_ok($$select pg_temp.chunk(89354, 89344, 89306, 1, 2)$$, '55000', null,
  'chunks after withdrawal are refused');
select throws_ok($$select pg_temp.open_stream(89345, 89306, 2)$$, '55000', null,
  'a withdrawn participant cannot open a new stream');

-- Re-admission after withdrawal stays refused.
select lives_ok($$select pg_temp.open_stream(89346, 89307, 1)$$, 'participant R captures under allow');
set local role service_role;
select pg_temp.decide(89307, 'withdraw');
select lives_ok($$select private.record_meet_ai_self_v1_admission(pg_temp.cid(89331), pg_temp.cid(89307), 1)$$,
  'withdrawn participant rejoins the room');
reset role;
select throws_ok($$select pg_temp.open_stream(89347, 89307, 2)$$, '55000', null,
  're-admission after withdrawal does not restore capture');

-- A revoked upload grant refuses chunks and survives re-admission.
update private.meet_ai_session_participants set upload_revoked_at = now()
 where session_id = pg_temp.cid(89331) and account_id = pg_temp.cid(89303);
select throws_ok($$select pg_temp.chunk(89355, 89343, 89303, 1, 1)$$, '55000', null,
  'chunks on a stream whose upload grant was revoked are refused');
set local role service_role;
select lives_ok($$select private.record_meet_ai_self_v1_admission(pg_temp.cid(89331), pg_temp.cid(89303), 1)$$,
  'removed participant rejoins the room');
reset role;
select ok((select upload_revoked_at is not null from private.meet_ai_session_participants
  where session_id = pg_temp.cid(89331) and account_id = pg_temp.cid(89303)),
  're-admission does not clear a revoked upload grant');
select throws_ok($$select pg_temp.chunk(89356, 89343, 89303, 2, 1)$$, '55000', null,
  'chunks stay refused after re-admission');
select throws_ok($$update private.meet_ai_session_participants set upload_revoked_at = null
  where session_id = pg_temp.cid(89331) and account_id = pg_temp.cid(89303)$$, '55000', null,
  'a revoked upload grant cannot be cleared directly');

-- A new allow is the only path back, at the new revision only.
set local role service_role;
select pg_temp.decide(89306, 'allow');
reset role;
select lives_ok($$select pg_temp.open_stream(89348, 89306, 2)$$, 'a fresh allow decision permits a new stream');
select throws_ok($$select pg_temp.chunk(89357, 89348, 89306, 0, 1)$$, '55000', null,
  'chunks carrying the pre-withdrawal revision are refused');
select lives_ok($$select pg_temp.chunk(89358, 89348, 89306, 0, 3); select pg_temp.chunk(89359, 89348, 89306, 1, 3)$$,
  'chunks at the new allow revision are stored');
select lives_ok($$update public.meet_ai_chunks set dispatch_consent_revision = 3 where id = pg_temp.cid(89358)$$,
  'dispatch is recorded at the current allow revision');
set local role service_role;
select pg_temp.decide(89306, 'withdraw');
reset role;
select throws_ok($$update public.meet_ai_chunks set dispatch_consent_revision = 3 where id = pg_temp.cid(89359)$$,
  '55000', null, 'no provider dispatch is recorded after withdrawal');
select throws_ok($$update public.meet_ai_chunks set dispatch_consent_revision = null where id = pg_temp.cid(89358)$$,
  '55000', null, 'a recorded dispatch revision is immutable');

-- Legacy account decisions also use server time before any writer ships.
set local role service_role;
select lives_ok($$insert into private.meet_ai_consents(session_id, user_id, decision, notice_version, created_at)
  values (pg_temp.cid(89333), pg_temp.cid(89305), 'allow', 'v1', clock_timestamp() + interval '10 minutes')$$,
  'a future-dated legacy allow is accepted with server time');
select ok((select created_at <= clock_timestamp() from private.meet_ai_consents
  where session_id = pg_temp.cid(89333) and user_id = pg_temp.cid(89305)),
  'the legacy client future timestamp is ignored');
select lives_ok($$insert into private.meet_ai_consents(session_id, user_id, decision, notice_version)
  values (pg_temp.cid(89333), pg_temp.cid(89305), 'withdraw', 'v1')$$,
  'legacy withdrawal succeeds after a future-dated allow');
select is((select decision from private.meet_ai_consents
  where session_id = pg_temp.cid(89333) and user_id = pg_temp.cid(89305)
  order by created_at desc, id desc limit 1), 'withdraw',
  'legacy withdrawal sorts after the future-dated allow');
delete from private.meet_ai_consents where session_id = pg_temp.cid(89333);
reset role;

-- Client clock skew must never prevent a later withdrawal.
set local role service_role;
select lives_ok($$insert into private.meet_ai_consents(session_id, user_id, decision, notice_version, created_at)
  values (pg_temp.cid(89331), pg_temp.cid(89305), 'allow', 'v1', clock_timestamp() + interval '10 minutes')$$,
  'a future-dated allow is accepted with server time');
select ok((select created_at <= clock_timestamp() from private.meet_ai_consents
  where session_id = pg_temp.cid(89331) and user_id = pg_temp.cid(89305)),
  'the client future timestamp is ignored');
reset role;
select lives_ok($$select pg_temp.open_stream(89349, 89305, 1)$$,
  'future-dated allow permits a live capture stream');
set local role service_role;
select lives_ok($$select pg_temp.decide(89305, 'withdraw')$$,
  'a future-dated allow cannot freeze later withdrawal');
reset role;
select is((select decision from private.meet_ai_self_v1_consent_state(pg_temp.cid(89331), pg_temp.cid(89305))),
  'withdraw', 'withdrawal replaces the future-dated allow');
select is((select state from private.meet_ai_capture_streams where id = pg_temp.cid(89349)), 'revoked',
  'withdrawal after a future-dated allow revokes the live stream');

-- Legal evidence: deletion during capture and session deletion keep it.
set local role service_role;
select throws_ok($$delete from private.meet_ai_consents where session_id = pg_temp.cid(89331)$$, '55000', null,
  'consent evidence cannot be deleted while capture can still run');
reset role;
select ok(to_regprocedure('private.release_meet_ai_self_v1_consents()') is null,
  'no trigger deletes consent evidence with a self-capture session');
update public.meet_ai_sessions set capture_state = 'deleted' where id = pg_temp.cid(89331);
select throws_ok($$delete from public.meet_ai_sessions where id = pg_temp.cid(89331)$$, '23503', null,
  'deleting a self-capture session with consent evidence is refused (RESTRICT)');
select throws_ok($$delete from public.workspaces where id = pg_temp.cid(89311)$$, '23503', null,
  'workspace deletion cannot cascade away self-capture consent evidence');
select is((select count(*)::int from private.meet_ai_consents where session_id = pg_temp.cid(89331)), 10,
  'every consent record of the session is kept');
select lives_ok($$delete from public.workspace_meetings where id = pg_temp.cid(89322)$$,
  'a self-capture session without consent evidence still deletes');
select ok(not exists (select 1 from private.meet_ai_session_participants where session_id = pg_temp.cid(89332))
  and not exists (select 1 from public.meet_ai_sessions where id = pg_temp.cid(89332)),
  'its admissions cascade with it');
-- Erasure fences capture before removing evidence and deleting the parent.
set local role service_role;
select lives_ok($$delete from private.meet_ai_consents where session_id = pg_temp.cid(89331)$$,
  'consent evidence can be erased once capture is deleted');
reset role;
select is((select count(*)::int from private.meet_ai_consents where session_id = pg_temp.cid(89331)), 0,
  'erase removes all consent evidence');
select lives_ok($$delete from public.meet_ai_sessions where id = pg_temp.cid(89331)$$,
  'session deletion succeeds after consent erasure');
select lives_ok($$delete from public.workspace_meetings where id = pg_temp.cid(89321);
  delete from public.workspaces where id = pg_temp.cid(89311)$$,
  'meeting and workspace deletion succeed after session erasure');
select ok(not exists (select 1 from public.workspaces where id = pg_temp.cid(89311))
  and not exists (select 1 from public.meet_ai_sessions where id = pg_temp.cid(89331))
  and not exists (select 1 from private.meet_ai_capture_streams where session_id = pg_temp.cid(89331)),
  'erased parents and capture streams are gone');
select * from finish();
rollback;
