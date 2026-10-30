-- Meet AI self_v1 PR 1 read contract: H3 own-speech and durable admission
-- reads, N5 durable live/after sharing, N4 coarse coverage, N1/H4 read-time
-- fences and deterministic pagination beyond the legacy 1,080-row limit.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select set_config('request.jwt.claims', '{}', true);
create function pg_temp.cid(n integer) returns uuid language sql as $$
 select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
-- C creator, A admin role, H host, P/Q admitted members, E admitted external
-- guest, N approved-but-never-admitted member, M generic member.
insert into auth.users(id) select pg_temp.cid(n) from generate_series(89201, 89208) n;
insert into public.users(id) select pg_temp.cid(n) from generate_series(89201, 89208) n on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id) values
 (pg_temp.cid(89211), 'Self read', false, pg_temp.cid(89201));
update public.workspace_default_permissions set enabled = false
 where ws_id = pg_temp.cid(89211) and permission = 'admin';
insert into public.workspace_members(ws_id, user_id, type)
 select pg_temp.cid(89211), pg_temp.cid(n), 'MEMBER' from unnest(array[89202, 89203, 89204, 89205, 89207, 89208]) n
 on conflict do nothing;
insert into public.workspace_roles(id, ws_id, name) values (pg_temp.cid(89212), pg_temp.cid(89211), 'Meet admin');
insert into public.workspace_role_permissions(ws_id, role_id, permission, enabled)
 values (pg_temp.cid(89211), pg_temp.cid(89212), 'admin', true);
insert into public.workspace_role_members(role_id, user_id) values (pg_temp.cid(89212), pg_temp.cid(89202));
insert into public.workspace_meetings(id, ws_id, creator_id, name)
 select pg_temp.cid(n), pg_temp.cid(89211), pg_temp.cid(89201), 'Meeting ' || n from generate_series(89221, 89223) n;
insert into public.meet_ai_sessions(id, meeting_id, user_id, protocol, billing_ws_id, billing_host_id, visibility) values
 (pg_temp.cid(89231), pg_temp.cid(89221), pg_temp.cid(89203), 'self_v1', pg_temp.cid(89211), pg_temp.cid(89203), 'participants'),
 (pg_temp.cid(89233), pg_temp.cid(89223), pg_temp.cid(89203), 'self_v1', pg_temp.cid(89211), pg_temp.cid(89203), 'participants');
set local role service_role;
select private.record_meet_ai_self_v1_admission(pg_temp.cid(89231), pg_temp.cid(n), 1)
 from unnest(array[89203, 89204, 89205, 89206]) n;
select private.record_meet_ai_self_v1_admission(pg_temp.cid(89233), pg_temp.cid(n), 1)
 from unnest(array[89203, 89204, 89205]) n;
reset role;
insert into private.meet_ai_capture_streams(id, session_id, account_id, device_epoch, input_processing, lease_expires_at)
 select pg_temp.cid(n + 38), pg_temp.cid(89231), pg_temp.cid(n), 1, 'processed_aec', now() + interval '30 seconds'
 from generate_series(89203, 89206) n;
insert into private.meet_ai_capture_streams(id, session_id, account_id, device_epoch, input_processing, lease_expires_at)
 select pg_temp.cid(n + 58), pg_temp.cid(89233), pg_temp.cid(n), 1, 'processed_aec', now() + interval '30 seconds'
 from generate_series(89204, 89205) n;
create function pg_temp.chunk(session integer, stream integer, account integer, seq integer, start_ms bigint)
returns void language sql as $$
  insert into public.meet_ai_chunks(id, session_id, sequence, start_seconds, duration_seconds, status, transcript,
    stream_id, account_id, source_kind, content_digest, start_ms, end_ms, timing_uncertainty_ms, start_sample,
    capture_consent_revision, erase_generation, transcript_revision)
  values (gen_random_uuid(), pg_temp.cid(session), seq, start_ms / 1000.0, 10, 'completed', 'speech of ' || account,
    pg_temp.cid(stream), pg_temp.cid(account), 'microphone', sha256((stream || ':' || seq)::bytea), start_ms,
    start_ms + 10000, 100, start_ms * 16, 1, 0, 0);
$$;
select pg_temp.chunk(89231, n + 38, n, 0, (n - 89203) * 1000) from generate_series(89203, 89206) n;
update public.meet_ai_sessions set notes = '{"summary": "mixed"}'::jsonb, notes_status = 'completed'
 where id = pg_temp.cid(89231);

create function pg_temp.role_of(n integer, session integer default 89231) returns text language sql as $$
  select private.meet_ai_self_v1_reader_role(pg_temp.cid(session), pg_temp.cid(n));
$$;
create function pg_temp.seen(n integer) returns text language sql as $$
  select coalesce(string_agg(right(s.account_id::text, 5) || case when s.is_own then '*' else '' end, ',' order by s.start_ms), '')
  from private.list_meet_ai_self_v1_segments(pg_temp.cid(89231), pg_temp.cid(n)) s;
$$;
create function pg_temp.notes_for(n integer) returns text language sql as $$
  select g.notes_state || '/' || coalesce(g.notes ->> 'summary', '-')
  from private.get_meet_ai_self_v1_notes(pg_temp.cid(89231), pg_temp.cid(n)) g;
$$;

-- H3 with both sharing flags off.
select is(pg_temp.role_of(89203), 'host', 'fixed session host reads everything');
select is(pg_temp.role_of(89201), 'admin', 'meeting workspace creator is an admin reader');
select is(pg_temp.role_of(89202), 'admin', 'explicit meeting workspace admin reads everything');
select is(pg_temp.seen(89202), '89203,89204,89205,89206', 'admin reads are not gated by host sharing');
select is(pg_temp.seen(89204), '89204*', 'admitted member reads only own speech with sharing off');
select is(pg_temp.seen(89206), '89206*', 'admitted external guest reads own speech without workspace membership');
select is(pg_temp.notes_for(89204), 'unavailable/-', 'own speech never grants mixed notes');
select is(pg_temp.notes_for(89203), 'completed/mixed', 'host reads mixed notes');
select is(pg_temp.role_of(89207), 'none', 'approved-but-never-admitted account reads nothing');
select is(pg_temp.role_of(89208), 'none', 'generic workspace member reads nothing');
select is(pg_temp.seen(89208), '', 'generic member receives no segments');
-- Removal, room cleanup and a missing room do not remove own access.
update private.meet_ai_session_participants set upload_revoked_at = now()
 where session_id = pg_temp.cid(89231) and account_id = pg_temp.cid(89204);
update private.meet_ai_capture_streams set state = 'closed', closed_at = now() where id = pg_temp.cid(89242);
select is(pg_temp.seen(89204), '89204*', 'own speech stays readable after removal and stream cleanup');

-- Durable host sharing (N5) and the participant read rule.
set local role service_role;
select throws_ok($$select private.set_meet_ai_self_v1_sharing(pg_temp.cid(89231), pg_temp.cid(89204), true, true, 0)$$,
  '42501', null, 'participants cannot change sharing');
select throws_ok($$select private.set_meet_ai_self_v1_sharing(pg_temp.cid(89231), pg_temp.cid(89202), true, true, 0)$$,
  '42501', null, 'admins review but cannot share on the host''s behalf');
select throws_ok($$select private.set_meet_ai_self_v1_sharing(pg_temp.cid(89231), pg_temp.cid(89203), true, true, 5)$$,
  '40001', null, 'stale sharing revision is rejected');
select is(private.set_meet_ai_self_v1_sharing(pg_temp.cid(89231), pg_temp.cid(89203), true, false, 0), 1,
  'host persists live sharing with a new revision');
reset role;
select is(pg_temp.role_of(89204), 'participant', 'durably admitted participant reads others while live sharing is on');
select is(pg_temp.seen(89204), '89203,89204*,89205,89206', 'shared participant reads all speech with own rows marked');
select is(pg_temp.notes_for(89206), 'completed/mixed', 'shared external guest reads mixed notes');
select is(pg_temp.role_of(89207), 'none', 'sharing never opens reads to approved-but-never-admitted accounts');
select is(pg_temp.role_of(89208), 'none', 'sharing never opens reads to generic members');
update public.meet_ai_sessions set visibility = 'host' where id = pg_temp.cid(89231);
select is(pg_temp.role_of(89204), 'own', 'host-only visibility keeps participants to their own speech');
update public.meet_ai_sessions set visibility = 'participants' where id = pg_temp.cid(89231);

-- N4: coverage collapses deny, withdraw, decide-later, unsupported and offline.
update private.meet_ai_capture_streams set state = 'closed', closed_at = now() where id = pg_temp.cid(89243);
update private.meet_ai_capture_streams set lease_expires_at = now() - interval '1 second' where id = pg_temp.cid(89244);
set local role service_role;
insert into private.meet_ai_consents(session_id, user_id, decision, notice_version) values
 (pg_temp.cid(89231), pg_temp.cid(89205), 'deny', 'v1'), (pg_temp.cid(89231), pg_temp.cid(89204), 'withdraw', 'v1');
reset role;
select is(pg_get_function_result('private.list_meet_ai_self_v1_coverage(uuid, uuid)'::regprocedure),
  'TABLE(account_id uuid, coverage text)', 'coverage shape carries no decision, reason or timestamp');
select is((select string_agg(right(c.account_id::text, 5) || '=' || c.coverage, ',' order by c.account_id)
  from private.list_meet_ai_self_v1_coverage(pg_temp.cid(89231), pg_temp.cid(89203)) c),
  '89203=contributing,89204=not_contributing,89205=not_contributing,89206=not_contributing',
  'host roster: withdrawn, denied and offline participants are indistinguishable');
select is((select string_agg(right(c.account_id::text, 5) || '=' || c.coverage, ',')
  from private.list_meet_ai_self_v1_coverage(pg_temp.cid(89231), pg_temp.cid(89204)) c),
  '89204=not_contributing', 'participants see only their own coverage row');
select is((select count(*)::int from private.list_meet_ai_self_v1_coverage(pg_temp.cid(89231), pg_temp.cid(89208))), 0,
  'generic members see no coverage');

-- N5: draining before its deadline is still live; durable closure switches.
update public.meet_ai_sessions set capture_state = 'draining', cutoff_at = now(),
  drain_deadline_at = now() + interval '20 seconds' where id = pg_temp.cid(89231);
select is(pg_temp.role_of(89204), 'participant', 'live flag applies until the durable drain deadline');
update public.meet_ai_sessions set capture_state = 'closed', ended_at = now() where id = pg_temp.cid(89231);
select is(pg_temp.role_of(89204), 'own', 'after-meeting flag (off) applies once the session is durably closed');
select is(pg_temp.role_of(89203), 'host', 'host access does not depend on sharing after the call');
set local role service_role;
select is(private.set_meet_ai_self_v1_sharing(pg_temp.cid(89231), pg_temp.cid(89203), false, true, 1), 2,
  'host persists after-meeting sharing');
reset role;
select is(pg_temp.role_of(89204), 'participant', 'after-meeting sharing opens reads for admitted participants');
select is((select string_agg(right(c.account_id::text, 5) || '=' || c.coverage, ',' order by c.account_id)
  from private.list_meet_ai_self_v1_coverage(pg_temp.cid(89231), pg_temp.cid(89203)) c),
  '89203=contributing,89204=contributing,89205=contributing,89206=contributing',
  'post-call coverage counts retained speech only');
-- A room that never ended: capture lifetime alone moves the session post-call.
insert into public.meet_ai_sessions(id, meeting_id, user_id, protocol, billing_ws_id, billing_host_id,
  visibility, created_at, purge_after) values
 (pg_temp.cid(89232), pg_temp.cid(89222), pg_temp.cid(89203), 'self_v1', pg_temp.cid(89211), pg_temp.cid(89203),
  'participants', now() - interval '4 hours', now() - interval '4 hours' + interval '365 days');
insert into private.meet_ai_session_participants(session_id, account_id, first_admitted_generation, last_admitted_generation)
 values (pg_temp.cid(89232), pg_temp.cid(89204), 1, 1);
set local role service_role;
select is(private.set_meet_ai_self_v1_sharing(pg_temp.cid(89232), pg_temp.cid(89203), true, false, 0), 1,
  'host enables only live sharing on a session whose room never ended');
reset role;
select is(pg_temp.role_of(89204, 89232), 'own', 'a never-ended room cannot keep the live flag past the capture lifetime');

-- Admission is written only by the room authority, for live sessions.
set local role service_role;
select throws_ok($$select private.record_meet_ai_self_v1_admission(pg_temp.cid(89231), pg_temp.cid(89207), 1)$$,
  '55000', null, 'closed sessions admit nobody');
select throws_ok($$select private.record_meet_ai_self_v1_admission(pg_temp.cid(89233), pg_temp.cid(89207), 2)$$,
  '40001', null, 'stale room generation cannot admit');
select lives_ok($$select private.record_meet_ai_self_v1_admission(pg_temp.cid(89233), pg_temp.cid(89204), 1)$$,
  're-admission is idempotent');
reset role;
select ok((select first_admitted_at = last_admitted_at and first_admitted_generation = 1 from private.meet_ai_session_participants
  where session_id = pg_temp.cid(89233) and account_id = pg_temp.cid(89204)), 'historical first admission is retained');
select set_config('request.jwt.claim.sub', pg_temp.cid(89202)::text, true);
select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.cid(89202), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
select throws_ok($$insert into private.meet_ai_session_participants(session_id, account_id, first_admitted_generation, last_admitted_generation)
  values (pg_temp.cid(89231), pg_temp.cid(89202), 1, 1)$$, '42501', null, 'a nonparticipant admin cannot fabricate admission');
select throws_ok($$select private.record_meet_ai_self_v1_admission(pg_temp.cid(89233), pg_temp.cid(89202), 1)$$,
  '42501', null, 'clients cannot call the admission RPC');
select throws_ok($$select * from private.list_meet_ai_self_v1_segments(pg_temp.cid(89231), pg_temp.cid(89202))$$,
  '42501', null, 'clients cannot call read RPCs with a chosen principal');
reset role;
select set_config('request.jwt.claims', '{}', true);

-- N1/H4: fences hide speech and redact mixed notes before physical cleanup.
insert into private.meet_ai_account_fences(account_id, reason, expires_at)
 values (pg_temp.cid(89205), 'account_deletion', now() + interval '365 days');
select is(pg_temp.seen(89203), '89203*,89204,89206', 'fenced account speech is hidden from the host immediately');
select is(pg_temp.seen(89205) || '/' || pg_temp.role_of(89205), '/none', 'an account being deleted reads nothing');
select is(pg_temp.notes_for(89203), 'redacted/-', 'mixed notes containing fenced speech are redacted');
select is((select count(*)::int from private.list_meet_ai_self_v1_coverage(pg_temp.cid(89231), pg_temp.cid(89203)) c
  where c.account_id = pg_temp.cid(89205)), 0, 'fenced account leaves the coverage roster');
set local role service_role;
select throws_ok($$select private.record_meet_ai_self_v1_admission(pg_temp.cid(89233), pg_temp.cid(89205), 1)$$,
  '55000', null, 'fenced accounts cannot be admitted');
reset role;
delete from private.meet_ai_account_fences where account_id = pg_temp.cid(89205);
insert into private.meet_ai_erasure_jobs(operation_id, scope, session_id, subject_account_id, subject_digest,
  requested_by, fence_generation, expires_at) values
 (gen_random_uuid(), 'person_session', pg_temp.cid(89231), pg_temp.cid(89206), sha256('subject'::bytea),
  'subject', 1, now() + interval '30 days');
select is(pg_temp.seen(89203), '89203*,89204,89205', 'person erase hides only that person''s speech');
select is(pg_temp.notes_for(89204), 'redacted/-', 'participants see redacted notes without learning who erased');
select throws_ok($$insert into private.meet_ai_erasure_jobs(operation_id, scope, session_id, subject_account_id,
  subject_digest, requested_by, fence_generation, expires_at) values (gen_random_uuid(), 'person_session',
  pg_temp.cid(89231), pg_temp.cid(89206), sha256('subject'::bytea), 'subject', 2, now() + interval '30 days')$$,
  '23505', null, 'one live erase job per subject and session');
delete from private.meet_ai_erasure_jobs where session_id = pg_temp.cid(89231);
update public.meet_ai_sessions set notes_redacted_at = now() where id = pg_temp.cid(89231);
select is(pg_temp.notes_for(89203), 'redacted/-', 'durable redaction marker hides notes from the host too');
update public.meet_ai_sessions set notes_redacted_at = null where id = pg_temp.cid(89231);
insert into private.meet_ai_erasure_jobs(operation_id, scope, session_id, requested_by, fence_generation, expires_at)
 values (gen_random_uuid(), 'session', pg_temp.cid(89231), 'workspace_admin', 1, now() + interval '30 days');
select is(pg_temp.role_of(89204), 'none', 'session erasure fences even own reads');
delete from private.meet_ai_erasure_jobs where session_id = pg_temp.cid(89231);
update public.meet_ai_sessions set purge_after = now() - interval '1 second' where id = pg_temp.cid(89231);
select is(pg_temp.role_of(89203) || '/' || pg_temp.role_of(89204), 'none/none', 'due retention fences every read');

-- Deterministic keyset pagination over 1,200 segments with equal start times.
select pg_temp.chunk(89233, n + 58, n, s, s * 10000)
 from generate_series(89204, 89205) n cross join generate_series(0, 599) s;
create temporary table paged(page integer, ord bigint, chunk_id uuid, start_ms bigint, account_id uuid,
  stream_id uuid, sequence integer);
do $$
declare
  page_no integer := 0;
  got integer;
  last paged;
begin
  loop
    insert into paged select page_no, r.ord, r.chunk_id, r.start_ms, r.account_id, r.stream_id, r.sequence
      from private.list_meet_ai_self_v1_segments(pg_temp.cid(89233), pg_temp.cid(89203),
        last.start_ms, last.account_id, last.stream_id, last.sequence, 500)
        with ordinality as r(chunk_id, account_id, stream_id, sequence, start_ms, end_ms,
          timing_uncertainty_ms, transcript, is_own, ord);
    get diagnostics got = row_count;
    exit when got < 500 or page_no > 5;
    select * into last from paged order by page desc, ord desc limit 1;
    page_no := page_no + 1;
  end loop;
end;
$$;
select is((select count(*)::int || '/' || count(distinct chunk_id)::int || '/' || max(page) from paged), '1200/1200/2',
  'three pages return every segment exactly once');
select ok(not exists (select 1 from (select (start_ms, account_id, stream_id, sequence) as k,
  lag((start_ms, account_id, stream_id, sequence)) over (order by page, ord) as prev from paged) t
  where t.prev is not null and t.k <= t.prev), 'pages follow (start_ms, uploader, stream, sequence) strictly');
select throws_ok($$select * from private.list_meet_ai_self_v1_segments(pg_temp.cid(89233), pg_temp.cid(89203), 0, null, null, null, 10)$$,
  '22023', null, 'partial cursors are rejected');
select throws_ok($$select * from private.list_meet_ai_self_v1_segments(pg_temp.cid(89233), pg_temp.cid(89203), null, null, null, null, 501)$$,
  '22023', null, 'page size is bounded');
select * from finish();
rollback;
