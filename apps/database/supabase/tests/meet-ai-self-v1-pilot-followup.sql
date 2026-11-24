-- Meet AI per-speaker transcription: the self_v1 pilot follow-up
-- (20261125999901). Notice evidence on allows; Auth-row locking for late
-- writes; account_erase; closed-out sessions as acknowledged no-ops; allow
-- refused once capture ends; room entries on purge and after erasure; stream
-- renewal under the live-upload fence; kept session erasure jobs; Mira choice
-- notice mode, pending id and system fallback; the E2b proof copy of the
-- notice hash when that store is installed.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select set_config('request.jwt.claims', '{}', true);
create function pg_temp.cid(n integer) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
-- 89601 host, 89602 A, 89603 B, 89604 C (account_erase pending),
-- 89605 D (account_erase completed), 89606 E (account_deletion completed),
-- 89607 F (person erasure), 89608 G (renewal).
insert into auth.users(id) select pg_temp.cid(n) from generate_series(89601, 89608) n;
insert into public.users(id) select pg_temp.cid(n) from generate_series(89601, 89608) n
  on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id)
  values (pg_temp.cid(89611), 'Pilot follow-up', false, pg_temp.cid(89601));
insert into public.workspace_meetings(id, ws_id, creator_id, name)
  select pg_temp.cid(n), pg_temp.cid(89611), pg_temp.cid(89601), 'Meeting ' || n
  from generate_series(89621, 89628) n;
-- 89621 main, 89622 deleted, 89623 purged, 89624 session erasure,
-- 89625 closed, 89626 legacy, 89627 past deadline, 89628 E2b proof.
select private.meet_ai_self_v1_start_session(pg_temp.cid(n), pg_temp.cid(89601), pg_temp.cid(89611))
  from generate_series(89621, 89628) n where n not in (89626, 89627);
insert into public.meet_ai_sessions(id, meeting_id, user_id)
  values (pg_temp.cid(89636), pg_temp.cid(89626), pg_temp.cid(89601));
-- A self_v1 session whose capture deadline has already passed.
insert into public.meet_ai_sessions(meeting_id, user_id, protocol, billing_ws_id, billing_host_id,
  capture_deadline_at, purge_after, visibility, cost_cap_usd)
  values (pg_temp.cid(89627), pg_temp.cid(89601), 'self_v1', pg_temp.cid(89611), pg_temp.cid(89601),
    now() - interval '1 minute', now() + interval '365 days', 'host', 20);

create function pg_temp.sess(meeting integer) returns uuid language sql as $$
  select id from public.meet_ai_sessions where meeting_id = pg_temp.cid(meeting);
$$;
create function pg_temp.hash() returns text language sql as $$
  select encode(sha256('notice'::bytea), 'hex');
$$;
create function pg_temp.dec(meeting integer, acct integer, decision text, seq bigint)
returns text language sql as $$
  select coalesce(r.revision::text, '-') || '/' || r.recorded
  from private.meet_ai_self_v1_record_decision(pg_temp.sess(meeting), pg_temp.cid(acct),
    decision, 'v1', seq, case when decision = 'allow' then 'en' end,
    case when decision = 'allow' then pg_temp.hash() end) r;
$$;
create function pg_temp.rows_for(meeting integer, acct integer) returns text language sql as $$
  select (select count(*) from private.meet_ai_consents
      where session_id = pg_temp.sess(meeting) and user_id = pg_temp.cid(acct))
    || '/' || (select count(*) from private.meet_ai_self_v1_room_ops
      where session_id = pg_temp.sess(meeting) and account_id = pg_temp.cid(acct));
$$;

-- Shape and grants.
select has_column('private', 'meet_ai_consents', 'locale', 'consents record the notice locale');
select has_column('private', 'meet_ai_consents', 'text_hash', 'consents record the notice text hash');
select ok(to_regprocedure('private.meet_ai_self_v1_record_decision(uuid, uuid, text, text, bigint)') is null
  and to_regprocedure('private.meet_ai_self_v1_record_decision(uuid, uuid, text, text, bigint, text, text)')
    is not null, 'record_decision takes the notice evidence; the five-argument form is gone');
select ok((select bool_and(has_function_privilege('service_role', p.oid, 'execute')
    and not has_function_privilege('anon', p.oid, 'execute')
    and not has_function_privilege('authenticated', p.oid, 'execute'))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname in ('meet_ai_self_v1_record_decision',
    'meet_ai_self_v1_closed_out', 'meet_ai_self_v1_account_gone', 'meet_ai_self_v1_renew_stream',
    'meet_ai_self_v1_end_upload', 'keep_meet_ai_session_erasure_job')
  having count(*) = 6), 'the changed functions are executable by the service role only');

-- Notice evidence: required on an allow, refused elsewhere, format-checked.
select throws_ok($$select private.meet_ai_self_v1_record_decision(pg_temp.sess(89621), pg_temp.cid(89602),
  'allow', 'v1', 1)$$, '22023', null, 'an allow without notice evidence is refused');
select throws_ok($$select private.meet_ai_self_v1_record_decision(pg_temp.sess(89621), pg_temp.cid(89602),
  'allow', 'v1', 1, 'en', null)$$, '22023', null, 'an allow without a text hash is refused');
select throws_ok($$select private.meet_ai_self_v1_record_decision(pg_temp.sess(89621), pg_temp.cid(89602),
  'allow', 'v1', 1, 'EN', pg_temp.hash())$$, '23514', null, 'a malformed locale is refused');
select throws_ok($$select private.meet_ai_self_v1_record_decision(pg_temp.sess(89621), pg_temp.cid(89602),
  'allow', 'v1', 1, 'vi-VN', upper(pg_temp.hash()))$$, '23514', null, 'a malformed text hash is refused');
select throws_ok($$select private.meet_ai_self_v1_record_decision(pg_temp.sess(89621), pg_temp.cid(89602),
  'deny', 'v1', 1, 'en', pg_temp.hash())$$, '23514', null, 'a deny carries no notice evidence');
select is(pg_temp.rows_for(89621, 89602), '0/0', 'refused decisions write nothing');
select is(pg_temp.dec(89621, 89602, 'allow', 1), '1/true', 'an allow with its notice evidence is recorded');
select ok((select locale = 'en' and text_hash = pg_temp.hash() from private.meet_ai_consents
  where session_id = pg_temp.sess(89621) and user_id = pg_temp.cid(89602)),
  'the allow keeps its locale and text hash');
select is(pg_temp.dec(89621, 89602, 'withdraw', 2), '2/true', 'a withdraw needs no notice evidence');
select throws_ok($$insert into private.meet_ai_consents(session_id, user_id, decision, notice_version, room_seq)
  values (pg_temp.sess(89621), pg_temp.cid(89603), 'allow', 'v1', 1)$$, '23514', null,
  'a direct self_v1 allow without notice evidence is refused');
select throws_ok($$insert into private.meet_ai_consents(session_id, user_id, decision, notice_version, locale)
  values (pg_temp.sess(89621), pg_temp.cid(89603), 'deny', 'v1', 'en')$$, '23514', null,
  'a direct self_v1 deny with notice evidence is refused');
select lives_ok($$insert into private.meet_ai_consents(session_id, user_id, decision, notice_version)
  values (pg_temp.cid(89636), pg_temp.cid(89603), 'allow', 'v1')$$,
  'legacy decisions are unchanged and need no notice evidence');

-- L1: the Auth row is locked FOR KEY SHARE before the session row.
select ok((select provolatile = 'v' and prosrc ~* 'for key share' from pg_proc
    where oid = 'private.meet_ai_self_v1_account_gone(uuid)'::regprocedure),
  'account_gone locks the Auth row for the rest of the transaction');
select ok((select strpos(prosrc, 'account_gone') < strpos(prosrc, 'for update') from pg_proc
    where oid = 'private.meet_ai_self_v1_record_decision(uuid, uuid, text, text, bigint, text, text)'::regprocedure)
  and (select strpos(prosrc, 'account_gone') < strpos(prosrc, 'for update') from pg_proc
    where oid = 'private.meet_ai_self_v1_end_upload(uuid, uuid, bigint, text)'::regprocedure),
  'record_decision and end_upload lock the Auth row before the session row');

-- account_erase: gone until the erase completes; account_deletion: gone for good.
insert into private.meet_ai_account_fences(account_id, reason, status, completed_at, expires_at) values
  (pg_temp.cid(89604), 'account_erase', 'running', null, now() + interval '30 days'),
  (pg_temp.cid(89605), 'account_erase', 'completed', now(), now() + interval '30 days'),
  (pg_temp.cid(89606), 'account_deletion', 'completed', now(), now() + interval '30 days');
select is(pg_temp.dec(89621, 89604, 'allow', 1), '0/false',
  'a decision during a running account_erase is acknowledged without a write');
select ok(not private.meet_ai_self_v1_revoke_upload(pg_temp.sess(89621), pg_temp.cid(89604), 2),
  'a revoke during a running account_erase is acknowledged without a write');
select is(pg_temp.rows_for(89621, 89604), '0/0', 'nothing is written for an erasing account');
select is(pg_temp.dec(89621, 89605, 'allow', 1), '1/true', 'a completed account_erase allows new decisions');
select is(pg_temp.dec(89621, 89606, 'withdraw', 1), '0/false',
  'a completed account_deletion fence still makes writes no-ops');
select is(pg_temp.rows_for(89621, 89606), '0/0', 'nothing is written for a deleted account');

-- G1: closed-out sessions take no writes; missing sessions are no-ops.
select is(pg_temp.dec(89622, 89602, 'allow', 1), '1/true', 'A allows in the session about to be deleted');
update public.meet_ai_sessions set capture_state = 'deleted', ended_at = now()
  where id = pg_temp.sess(89622);
select is(pg_temp.dec(89622, 89602, 'withdraw', 2), '1/false', 'a withdraw after capture was deleted is a no-op');
select ok(not private.meet_ai_self_v1_close_stream(pg_temp.sess(89622), pg_temp.cid(89602), 3),
  'a close after capture was deleted is a no-op');
select ok(not private.meet_ai_self_v1_revoke_upload(pg_temp.sess(89622), pg_temp.cid(89602), 4),
  'a revoke after capture was deleted is a no-op');
insert into private.meet_ai_consents(session_id, user_id, decision, notice_version)
  values (pg_temp.sess(89622), pg_temp.cid(89602), 'withdraw', 'v1');
select is(pg_temp.rows_for(89622, 89602), '1/1', 'a direct insert after capture was deleted is skipped');

select is(pg_temp.dec(89623, 89602, 'allow', 1), '1/true', 'A allows in the session about to be purged');
update public.meet_ai_sessions set transcript_purged_at = now() where id = pg_temp.sess(89623);
select is(pg_temp.rows_for(89623, 89602), '1/0', 'a purge removes room entries while capture is active');
select is(pg_temp.dec(89623, 89602, 'withdraw', 2), '1/false', 'a withdraw after the purge is a no-op');
select ok(not private.meet_ai_self_v1_close_stream(pg_temp.sess(89623), pg_temp.cid(89602), 3),
  'a close after the purge is a no-op');
select is(pg_temp.rows_for(89623, 89602), '1/0', 'nothing returns after the purge');
select ok(private.meet_ai_self_v1_capturing((select s from public.meet_ai_sessions s
    where s.id = pg_temp.sess(89621))), 'a live session captures');
select ok(not private.meet_ai_self_v1_capturing((select s from public.meet_ai_sessions s
    where s.id = pg_temp.sess(89623))), 'a purged session that is still active no longer captures');

insert into private.meet_ai_erasure_jobs(operation_id, scope, session_id, requested_by, fence_generation,
  expires_at) values (gen_random_uuid(), 'session', pg_temp.sess(89624), 'workspace_admin', 1,
  now() + interval '30 days');
select is(pg_temp.dec(89624, 89602, 'allow', 1), '0/false', 'a pending session erasure makes writes no-ops');
select ok(not private.meet_ai_self_v1_revoke_upload(pg_temp.sess(89624), pg_temp.cid(89602), 2),
  'a revoke under a session erasure is a no-op');
select is(pg_temp.rows_for(89624, 89602), '0/0', 'nothing is written under a session erasure');

select is(pg_temp.dec(89621, 89607, 'allow', 1), '1/true', 'F allows');
select is(pg_temp.dec(89621, 89603, 'allow', 1), '1/true', 'B allows');
insert into private.meet_ai_erasure_jobs(id, operation_id, scope, session_id, subject_account_id,
  subject_digest, requested_by, fence_generation, status, completed_at, expires_at)
  values (pg_temp.cid(89641), gen_random_uuid(), 'person_session', pg_temp.sess(89621), pg_temp.cid(89607),
    sha256('f'::bytea), 'subject', 1, 'completed', now(), now() + interval '30 days');
select is(pg_temp.dec(89621, 89607, 'withdraw', 2), '2/true',
  'a withdraw after that person''s erasure completed is still recorded');
select ok(private.meet_ai_self_v1_close_stream(pg_temp.sess(89621), pg_temp.cid(89607), 3),
  'a close after that person''s erasure completed is still recorded');
select is(pg_temp.dec(89621, 89607, 'allow', 4), '2/false',
  'an allow after that person''s erasure completed is a no-op');
select is(pg_temp.dec(89621, 89603, 'withdraw', 2), '2/true', 'another account in that session still records');

select is((select r.revision::text || '/' || r.recorded from private.meet_ai_self_v1_record_decision(
    gen_random_uuid(), pg_temp.cid(89602), 'withdraw', 'v1', 1) r), null,
  'a decision for a missing session returns no revision');
select is((select r.recorded from private.meet_ai_self_v1_record_decision(
    gen_random_uuid(), pg_temp.cid(89602), 'withdraw', 'v1', 1) r), false,
  'a decision for a missing session is an acknowledged no-op');
select ok(not private.meet_ai_self_v1_close_stream(gen_random_uuid(), pg_temp.cid(89602), 1),
  'a close for a missing session is an acknowledged no-op');
select throws_ok($$select private.meet_ai_self_v1_record_decision(pg_temp.cid(89636), pg_temp.cid(89602),
  'withdraw', 'v1', 1)$$, 'P0002', null, 'legacy sessions are still refused');

-- An allow is refused once capture has ended; deny and withdraw still record.
select is(pg_temp.dec(89625, 89602, 'allow', 1), '1/true', 'A allows before the stop');
select private.meet_ai_self_v1_stop_session(pg_temp.sess(89625), pg_temp.cid(89601), true);
select throws_ok($$select pg_temp.dec(89625, 89602, 'allow', 2)$$, '55000', 'Capture has ended for this session',
  'an allow after a hard stop is refused');
select is(pg_temp.dec(89625, 89602, 'withdraw', 3), '2/true', 'a withdraw after the stop is still recorded');
select throws_ok($$select pg_temp.dec(89627, 89602, 'allow', 1)$$, '55000', 'Capture has ended for this session',
  'an allow after the capture deadline is refused');
select is(pg_temp.dec(89627, 89602, 'withdraw', 2), '1/true', 'a withdraw after the deadline is still recorded');

-- G2 and L2: an erasure completing on a session that no longer captures
-- removes its room entries at once, under a session row lock.
insert into private.meet_ai_erasure_jobs(operation_id, scope, session_id, subject_account_id,
  subject_digest, requested_by, fence_generation, status, completed_at, expires_at)
  values (gen_random_uuid(), 'person_session', pg_temp.sess(89627), pg_temp.cid(89602), sha256('a'::bytea),
    'subject', 1, 'completed', now(), now() + interval '30 days');
select is(pg_temp.rows_for(89627, 89602), '1/0',
  'a person erasure on a session past its deadline removes that person''s room entries');
select ok((select prosrc ~* 'for share' from pg_proc
    where oid = 'private.erase_meet_ai_self_v1_room_ops()'::regprocedure),
  'the erasure branch locks the session row');

-- G3: renewal re-checks the live-upload fence and the current allow.
select is(pg_temp.dec(89621, 89608, 'allow', 1), '1/true', 'G allows');
select set_config('test.sg', (select o.stream_id from private.meet_ai_self_v1_open_stream(
  pg_temp.sess(89621), pg_temp.cid(89608), 1, 1) o)::text, true);
select ok(private.meet_ai_self_v1_renew_stream(current_setting('test.sg')::uuid, pg_temp.cid(89608)) > now(),
  'a live stream renews');
insert into private.meet_ai_erasure_jobs(id, operation_id, scope, session_id, subject_account_id,
  subject_digest, requested_by, fence_generation, expires_at)
  values (pg_temp.cid(89642), gen_random_uuid(), 'person_session', pg_temp.sess(89621), pg_temp.cid(89608),
    sha256('g'::bytea), 'subject', 1, now() + interval '30 days');
select throws_ok($$select private.meet_ai_self_v1_renew_stream(current_setting('test.sg')::uuid,
  pg_temp.cid(89608))$$, '55000', 'Uploader is fenced by deletion or erasure',
  'renewal is refused under a pending person erasure');
delete from private.meet_ai_erasure_jobs where id = pg_temp.cid(89642);
select ok(private.meet_ai_self_v1_renew_stream(current_setting('test.sg')::uuid, pg_temp.cid(89608)) > now(),
  'renewal resumes once the fence is gone');
select ok(private.meet_ai_self_v1_revoke_upload(pg_temp.sess(89621), pg_temp.cid(89608), 2), 'G is removed');
select throws_ok($$select private.meet_ai_self_v1_renew_stream(current_setting('test.sg')::uuid,
  pg_temp.cid(89608))$$, '55000', 'Upload was revoked for this session', 'renewal is refused after a revoke');

-- Session erasure jobs are kept while their session exists.
select throws_ok($$delete from private.meet_ai_erasure_jobs where session_id = pg_temp.sess(89624)$$,
  '55000', null, 'a session erasure job cannot be deleted while its session exists');
select lives_ok($$delete from private.meet_ai_erasure_jobs where id = pg_temp.cid(89641)$$,
  'a person erasure job can still be deleted');
update private.meet_ai_erasure_jobs set session_id = null where session_id = pg_temp.sess(89624);
select lives_ok($$delete from private.meet_ai_erasure_jobs where scope = 'session' and session_id is null
  and requested_by = 'workspace_admin'$$, 'a session erasure job without its session can be deleted');

-- Mira choices: notice mode, pending id and the system fallback source.
create function pg_temp.mira_choice(mode text, source text, pending uuid default null)
returns void language sql as $$
  insert into private.meet_mira_participant_choices(meeting_id, ws_id, acceptance_revision, user_id,
    participant_ref, choice, source, notice_version, text_hash, locale, notice_mode, pending_id)
  values (pg_temp.cid(89621), pg_temp.cid(89611), 0, pg_temp.cid(89602), gen_random_uuid(), 'off', source,
    'v1', pg_temp.hash(), 'en', mode, pending);
$$;
select lives_ok($$insert into private.meet_mira_participant_choices(meeting_id, ws_id, acceptance_revision,
  user_id, participant_ref, choice, source, notice_version, text_hash, locale) values (pg_temp.cid(89621),
  pg_temp.cid(89611), 0, pg_temp.cid(89602), gen_random_uuid(), 'off', 'join', 'v1', pg_temp.hash(), 'en')$$,
  'an existing writer that names neither new column still inserts');
select is((select notice_mode from private.meet_mira_participant_choices
  where meeting_id = pg_temp.cid(89621) and source = 'join'), 'room', 'the notice mode defaults to room');
select lives_ok($$select pg_temp.mira_choice('self', 'system_fallback', gen_random_uuid())$$,
  'a system fallback choice under the per-speaker notice records its pending id');
select throws_ok($$select pg_temp.mira_choice('both', 'join')$$, '23514', null, 'an unknown notice mode is refused');
select throws_ok($$select pg_temp.mira_choice('room', 'automatic')$$, '23514', null,
  'an unknown source is still refused');
select col_is_null('private', 'meet_mira_participant_choices', 'pending_id', 'the pending id is optional');

-- E2b proof copy: when the proof store is installed, an erased self_v1 allow
-- keeps its notice hash. Skips cleanly before that store exists.
create function pg_temp.proof_keeps_hash() returns setof text language plpgsql as $$
declare
  kept text;
begin
  if to_regclass('private.meet_consent_proofs') is null then
    return query select skip('the E2b consent proof store is not installed', 1);
    return;
  end if;
  perform pg_temp.dec(89628, 89602, 'allow', 1);
  perform private.meet_ai_self_v1_stop_session(pg_temp.sess(89628), pg_temp.cid(89601), true);
  perform private.erase_meet_mira_evidence(pg_temp.cid(89628), null, 'meeting_deleted');
  execute 'select text_hash from private.meet_consent_proofs
    where kind = ''self_v1_decision'' and meeting_id = $1 and choice = ''allow'''
    into kept using pg_temp.cid(89628);
  return query select is(kept, pg_temp.hash(), 'the proof copy keeps the self_v1 notice hash');
end;
$$;
select * from pg_temp.proof_keeps_hash();

select * from finish();
rollback;
