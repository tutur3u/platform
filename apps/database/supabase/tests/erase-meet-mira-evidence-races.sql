-- pgTAP for 20261125070000_fix_meet_erase_session_locks (DRAFT: fixtures need
-- a first run on a gate host). One session cannot interleave two
-- transactions, so the lock order is checked structurally and the
-- active-capture refusal is exercised for real.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select set_config('request.jwt.claims', '{}', true);
create function pg_temp.cid(n integer) returns uuid language sql immutable as
  $$ select ('e6000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- Lock order: sessions, then accounts, then the first copy.
select ok(
  position('for update of s' in pg_get_functiondef('private.erase_meet_mira_evidence(uuid,uuid,text)'::regprocedure)) > 0
  and position('for update of s' in pg_get_functiondef('private.erase_meet_mira_evidence(uuid,uuid,text)'::regprocedure))
    < position('for key share of u' in pg_get_functiondef('private.erase_meet_mira_evidence(uuid,uuid,text)'::regprocedure)),
  'sessions are locked before the accounts are collected and locked'
);
select ok(
  position('for key share' in pg_get_functiondef('private.erase_meet_mira_evidence(uuid,uuid,text)'::regprocedure))
    < position('insert into private.meet_consent_proofs' in pg_get_functiondef('private.erase_meet_mira_evidence(uuid,uuid,text)'::regprocedure)),
  'and both locks come before the first copy'
);
select ok(not has_function_privilege('anon', 'private.erase_meet_mira_evidence(uuid,uuid,text)', 'EXECUTE'), 'anon still cannot erase evidence');
select ok(has_function_privilege('service_role', 'private.erase_meet_mira_evidence(uuid,uuid,text)', 'EXECUTE'), 'the service role keeps EXECUTE on the erase routine');
select ok((select prosecdef from pg_proc where oid = 'private.erase_meet_mira_evidence(uuid,uuid,text)'::regprocedure), 'the erase routine is still a definer function');
select ok(not has_function_privilege('service_role', 'private.anonymize_linked_meet_evidence()', 'EXECUTE'), 'the service role cannot call the account trigger function');

-- Fixtures: a self_v1 meeting whose capture is active, one speaker.
insert into auth.users(id) values (pg_temp.cid(1)), (pg_temp.cid(2)), (pg_temp.cid(3));
insert into public.users(id) values (pg_temp.cid(1)), (pg_temp.cid(2)), (pg_temp.cid(3)) on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id) values
  (pg_temp.cid(11), 'Erase race', false, pg_temp.cid(1));
insert into public.workspace_meetings(id, ws_id, creator_id, name, time) values
  (pg_temp.cid(21), pg_temp.cid(11), pg_temp.cid(1), 'Live capture', now()),
  (pg_temp.cid(22), pg_temp.cid(11), pg_temp.cid(1), 'Closed capture', now());
insert into public.meet_ai_sessions(id, meeting_id, user_id, protocol, billing_ws_id, billing_host_id) values
  (pg_temp.cid(31), pg_temp.cid(21), pg_temp.cid(1), 'self_v1', pg_temp.cid(11), pg_temp.cid(1)),
  (pg_temp.cid(32), pg_temp.cid(22), pg_temp.cid(1), 'self_v1', pg_temp.cid(11), pg_temp.cid(1));
set local role service_role;
select private.record_meet_ai_self_v1_admission(pg_temp.cid(31), pg_temp.cid(2), 1);
select private.record_meet_ai_self_v1_admission(pg_temp.cid(32), pg_temp.cid(2), 1);
insert into private.meet_ai_consents(session_id, user_id, decision, notice_version, room_seq, locale, text_hash) values
  (pg_temp.cid(31), pg_temp.cid(2), 'allow', 'v1', 1, 'en', encode(sha256('notice'::bytea), 'hex')),
  (pg_temp.cid(32), pg_temp.cid(2), 'allow', 'v1', 1, 'en', encode(sha256('notice'::bytea), 'hex'));
reset role;

-- The speaker's account is deleted while capture is still active: the row
-- guard skips their now-anonymous decision, the session-level check does not.
delete from auth.users where id = pg_temp.cid(2);
select is((select count(*)::int from private.meet_ai_consents where session_id = pg_temp.cid(31) and user_id is null), 1, 'account deletion anonymized the live decision');
select throws_ok($$select private.erase_meet_mira_evidence(pg_temp.cid(21), null, 'meeting_deleted')$$, '55000', 'self_v1 consent evidence is kept while capture can run', 'an active capture session is not erased even when its speaker account is gone');
select throws_ok($$select private.delete_meeting_erasing_mira(pg_temp.cid(11), pg_temp.cid(21))$$, '55000', null, 'the meeting delete wrapper is refused the same way');
select is((select count(*)::int from private.meet_ai_consents where session_id = pg_temp.cid(31)), 1, 'a refused erase keeps the decision');
select is((select count(*)::int from private.meet_consent_proofs where meeting_id = pg_temp.cid(21)), 0, 'and writes no proof');
select is((select count(*)::int from public.workspace_meetings where id = pg_temp.cid(21)), 1, 'and the meeting stays');
select throws_ok($$select private.erase_meet_mira_evidence(null, pg_temp.cid(11), 'workspace_deleted')$$, '55000', null, 'a workspace erase is refused while any of its sessions captures');

-- Once capture is closed the same shape erases normally.
select lives_ok(
  $$update public.meet_ai_sessions set capture_state = 'closed', ended_at = now(), cutoff_at = coalesce(cutoff_at, now()) where id = pg_temp.cid(31)$$,
  'capture can be closed'
);
select is(private.erase_meet_mira_evidence(pg_temp.cid(21), null, 'meeting_deleted'), '{"acceptances": 0, "choices": 0, "consents": 1}'::jsonb, 'a closed capture session erases');
select is((select count(*)::int from private.meet_consent_proofs where meeting_id = pg_temp.cid(21) and user_id is null), 1, 'and its proof holds no account id');

-- A draining capture session is refused too, by the session-level check
-- (its only speaker's account is gone) and by the row guard (a live speaker).
insert into auth.users(id) values (pg_temp.cid(4)), (pg_temp.cid(5));
insert into public.users(id) values (pg_temp.cid(4)), (pg_temp.cid(5)) on conflict do nothing;
insert into public.workspace_meetings(id, ws_id, creator_id, name, time) values
  (pg_temp.cid(25), pg_temp.cid(11), pg_temp.cid(1), 'Draining capture', now()),
  (pg_temp.cid(26), pg_temp.cid(11), pg_temp.cid(1), 'Draining live speaker', now());
insert into public.meet_ai_sessions(id, meeting_id, user_id, protocol, billing_ws_id, billing_host_id) values
  (pg_temp.cid(35), pg_temp.cid(25), pg_temp.cid(1), 'self_v1', pg_temp.cid(11), pg_temp.cid(1)),
  (pg_temp.cid(36), pg_temp.cid(26), pg_temp.cid(1), 'self_v1', pg_temp.cid(11), pg_temp.cid(1));
set local role service_role;
select private.record_meet_ai_self_v1_admission(pg_temp.cid(35), pg_temp.cid(4), 1);
select private.record_meet_ai_self_v1_admission(pg_temp.cid(36), pg_temp.cid(5), 1);
insert into private.meet_ai_consents(session_id, user_id, decision, notice_version, room_seq, locale, text_hash) values
  (pg_temp.cid(35), pg_temp.cid(4), 'allow', 'v1', 1, 'en', encode(sha256('notice'::bytea), 'hex')),
  (pg_temp.cid(36), pg_temp.cid(5), 'allow', 'v1', 1, 'en', encode(sha256('notice'::bytea), 'hex'));
reset role;
select lives_ok(
  $$update public.meet_ai_sessions set capture_state = 'draining', cutoff_at = now(), drain_deadline_at = now() + interval '10 seconds' where id in (pg_temp.cid(35), pg_temp.cid(36))$$,
  'capture can be set draining'
);
select is((select count(*)::int from public.meet_ai_sessions where id in (pg_temp.cid(35), pg_temp.cid(36)) and capture_state = 'draining'), 2, 'both fixture sessions are draining');
-- Only the first session's speaker loses their account.
delete from auth.users where id = pg_temp.cid(4);
select is((select count(*)::int from private.meet_ai_consents where session_id = pg_temp.cid(35) and user_id is null), 1, 'account deletion anonymized the draining decision');
select throws_ok($$select private.erase_meet_mira_evidence(pg_temp.cid(25), null, 'meeting_deleted')$$, '55000', 'self_v1 consent evidence is kept while capture can run', 'a draining session with an anonymized decision is not erased');
select throws_ok($$select private.erase_meet_mira_evidence(pg_temp.cid(26), null, 'meeting_deleted')$$, '55000', 'self_v1 consent evidence is kept while capture can run', 'a draining session with a live speaker is not erased either');
select is((select count(*)::int from private.meet_ai_consents where session_id in (pg_temp.cid(35), pg_temp.cid(36))), 2, 'refused erases keep both decisions');
select is((select count(*)::int from private.meet_consent_proofs where meeting_id in (pg_temp.cid(25), pg_temp.cid(26))), 0, 'and write no proof');
select throws_ok($$select private.erase_meet_mira_evidence(null, pg_temp.cid(11), 'workspace_deleted')$$, '55000', null, 'a workspace erase is refused while a session drains');
-- Once draining ends and capture is closed they erase normally.
select lives_ok(
  $$update public.meet_ai_sessions set capture_state = 'closed', ended_at = now() where id in (pg_temp.cid(35), pg_temp.cid(36))$$,
  'draining capture can be closed'
);
select lives_ok($$select private.erase_meet_mira_evidence(pg_temp.cid(25), null, 'meeting_deleted')$$, 'a closed formerly-draining session erases');

-- Regression shapes the session-level check must not change.
-- A legacy (non-self_v1) session with consent rows (it has no capture state) is not refused.
insert into public.workspace_meetings(id, ws_id, creator_id, name, time) values
  (pg_temp.cid(23), pg_temp.cid(11), pg_temp.cid(1), 'Legacy', now()),
  (pg_temp.cid(24), pg_temp.cid(11), pg_temp.cid(1), 'No evidence', now());
insert into public.meet_ai_sessions(id, meeting_id, user_id) values
  (pg_temp.cid(33), pg_temp.cid(23), pg_temp.cid(1));
insert into private.meet_ai_consents(session_id, user_id, decision, notice_version) values
  (pg_temp.cid(33), pg_temp.cid(3), 'allow', 'v1');
select lives_ok($$select private.erase_meet_mira_evidence(pg_temp.cid(23), null, 'meeting_deleted')$$, 'a legacy session with consent rows is still erased');
-- A self_v1 session with no consent rows is not refused either.
insert into public.meet_ai_sessions(id, meeting_id, user_id, protocol, billing_ws_id, billing_host_id) values
  (pg_temp.cid(34), pg_temp.cid(24), pg_temp.cid(1), 'self_v1', pg_temp.cid(11), pg_temp.cid(1));
select lives_ok($$select private.erase_meet_mira_evidence(pg_temp.cid(24), null, 'meeting_deleted')$$, 'an active self_v1 session without consent rows is not refused');

-- The account trigger still fires with EXECUTE revoked from service_role.
select is((select count(*)::int from private.meet_consent_proofs where user_id = pg_temp.cid(3)), 1, 'the legacy proof names the live account');
select lives_ok($$delete from auth.users where id = pg_temp.cid(3)$$, 'an account with proof rows can still be deleted');
select is((select count(*)::int from private.meet_consent_proofs where user_id = pg_temp.cid(3)), 0, 'and its id is cleared from proof rows by the trigger');

select * from finish();
rollback;
