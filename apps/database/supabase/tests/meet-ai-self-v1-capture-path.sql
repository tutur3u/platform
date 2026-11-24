-- Meet AI per-speaker transcription: the self_v1 capture path RPCs and chunk
-- fence (20261124100000, 20261124100100). Room sequence watermark across
-- decisions, close and revoke; the 10-allow cap; stream open, renewal and
-- lease expiry; cost reservation and exactly-once settlement; the dispatch
-- and text fences; stop, drain and the notes attempt budget. Legacy sessions
-- and public.reserve_meet_ai_chunk keep their behaviour.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select set_config('request.jwt.claims', '{}', true);
create function pg_temp.cid(n integer) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
-- 89401 creator, 89402 host, 89403 A, 89404 B, 89405 C (never admitted),
-- 89406 D (allow cap), 89407 E (drain), 89408 F (hard stop),
-- 89409 G (lease and close fence), 89410 H (revoke fence), 89411 I (erase generation
-- and account fence), 89412 J (erasure job).
insert into auth.users(id) select pg_temp.cid(n) from generate_series(89401, 89412) n;
insert into public.users(id) select pg_temp.cid(n) from generate_series(89401, 89412) n
  on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id) values
  (pg_temp.cid(89411), 'Per speaker', false, pg_temp.cid(89401)),
  (pg_temp.cid(89412), 'Other', false, pg_temp.cid(89401));
insert into public.workspace_meetings(id, ws_id, creator_id, name) values
  (pg_temp.cid(89421), pg_temp.cid(89411), pg_temp.cid(89401), 'Per speaker'),
  (pg_temp.cid(89422), pg_temp.cid(89411), pg_temp.cid(89401), 'Hard stop'),
  (pg_temp.cid(89423), pg_temp.cid(89411), pg_temp.cid(89401), 'Legacy');
insert into public.meet_ai_sessions(id, meeting_id, user_id) values
  (pg_temp.cid(89433), pg_temp.cid(89423), pg_temp.cid(89402));

create function pg_temp.sid() returns uuid language sql as $$
  select current_setting('test.sid')::uuid;
$$;
create function pg_temp.decide(acct integer, decision text, seq bigint)
returns text language sql as $$
  select r.revision || '/' || r.recorded from private.meet_ai_self_v1_record_decision(
    pg_temp.sid(), pg_temp.cid(acct), decision, 'v1', seq) r;
$$;
create function pg_temp.open(acct integer, rev integer, gen integer default 1)
returns uuid language sql as $$
  select o.stream_id from private.meet_ai_self_v1_open_stream(
    pg_temp.sid(), pg_temp.cid(acct), gen, rev) o;
$$;
create function pg_temp.reserve(chunk integer, stream uuid, acct integer, seq integer,
  rev integer, max_cost numeric, digest_salt text default '', session uuid default null)
returns public.meet_ai_chunks language sql as $$
  select private.meet_ai_self_v1_reserve_chunk(pg_temp.cid(chunk),
    coalesce(session, pg_temp.sid()), stream, pg_temp.cid(acct), seq, seq * 160000::bigint,
    seq * 10000::bigint, seq * 10000::bigint + 5000, sha256((chunk || digest_salt)::bytea),
    rev, 5, max_cost);
$$;
create function pg_temp.costs() returns text language sql as $$
  select format('%s/%s/%s', cost_reserved_usd::numeric(10, 2),
    cost_unknown_usd::numeric(10, 2), cost_settled_usd::numeric(10, 2))
  from public.meet_ai_sessions where id = pg_temp.sid();
$$;
create function pg_temp.settle(chunk integer, outcome text, transcript text default null,
  usage jsonb default null, cost numeric default null)
returns public.meet_ai_chunks language sql as $$
  select private.meet_ai_self_v1_settle_chunk(pg_temp.cid(chunk), outcome, transcript, usage, cost);
$$;

-- Grants: service role only.
select ok((select bool_and(has_function_privilege('service_role', p.oid, 'execute')
    and not has_function_privilege('anon', p.oid, 'execute')
    and not has_function_privilege('authenticated', p.oid, 'execute'))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname in ('meet_ai_self_v1_start_session',
    'meet_ai_self_v1_record_decision', 'meet_ai_self_v1_open_stream',
    'meet_ai_self_v1_renew_stream', 'meet_ai_self_v1_close_stream',
    'meet_ai_self_v1_revoke_upload', 'meet_ai_self_v1_reserve_chunk',
    'meet_ai_self_v1_mark_dispatch', 'meet_ai_self_v1_settle_chunk',
    'meet_ai_self_v1_stop_session', 'meet_ai_self_v1_close_drained',
    'meet_ai_self_v1_note_attempt')
  having count(*) = 12), 'every capture RPC is executable by the service role only');

-- start_session invariants.
select throws_ok($$select private.meet_ai_self_v1_start_session(pg_temp.cid(89421),
  pg_temp.cid(89402), pg_temp.cid(89412))$$, '23514', null,
  'the payer workspace must own the meeting');
select throws_ok($$select private.meet_ai_self_v1_start_session(pg_temp.cid(89499),
  pg_temp.cid(89402), pg_temp.cid(89411))$$, 'P0002', null, 'an unknown meeting is refused');
select throws_ok($$select private.meet_ai_self_v1_start_session(null, pg_temp.cid(89402),
  pg_temp.cid(89411))$$, '22023', null, 'missing arguments are refused');
set local role service_role;
select set_config('test.sid', (private.meet_ai_self_v1_start_session(pg_temp.cid(89421),
  pg_temp.cid(89402), pg_temp.cid(89411))).id::text, true);
reset role;
select ok((select protocol = 'self_v1' and user_id = pg_temp.cid(89402)
    and billing_host_id = pg_temp.cid(89402) and billing_ws_id = pg_temp.cid(89411)
    and capture_state = 'active' and capture_deadline_at = created_at + interval '3 hours'
    and purge_after = created_at + interval '365 days' and visibility = 'host'
    and cost_cap_usd = 20 and stop_generation = 0 and ended_at is null
  from public.meet_ai_sessions where id = pg_temp.sid()),
  'start_session fixes the host payer, deadlines, retention, visibility and cap');
select throws_ok($$select private.meet_ai_self_v1_start_session(pg_temp.cid(89421),
  pg_temp.cid(89402), pg_temp.cid(89411))$$, '55000', null,
  'a meeting runs one transcription session at a time');

-- Room sequence watermark across decisions, close and revoke (account A).
set local role service_role;
select is(pg_temp.decide(89403, 'allow', 1), '1/true', 'a decision before admission is recorded');
reset role;
select is(pg_temp.decide(89403, 'allow', 1), '1/false',
  'an exact duplicate room_seq is a no-op that returns the current revision');
select is((select count(*)::int from private.meet_ai_consents
  where session_id = pg_temp.sid() and user_id = pg_temp.cid(89403)), 1,
  'the duplicate wrote no second consent row');
select throws_ok($$select pg_temp.decide(89403, 'withdraw', 1)$$, '40001', null,
  'a different entry at a recorded room_seq is refused');
select throws_ok($$select pg_temp.decide(89403, 'deny', 0)$$, '23514', null,
  'room_seq must be positive');
select throws_ok($$select pg_temp.decide(89403, 'maybe', 2)$$, '23514', null,
  'unknown decisions are refused');
select is(pg_temp.decide(89403, 'withdraw', 3), '2/true', 'a newer withdraw is recorded');
select throws_ok($$select pg_temp.decide(89403, 'allow', 2)$$, '40001', null,
  'an older decision never lands after a newer one');
select throws_ok($$select private.meet_ai_self_v1_close_stream(pg_temp.sid(), pg_temp.cid(89403), 3)$$,
  '40001', null, 'close cannot reuse a decision room_seq');
select ok(private.meet_ai_self_v1_close_stream(pg_temp.sid(), pg_temp.cid(89403), 4),
  'a newer close is applied');
select ok(not private.meet_ai_self_v1_close_stream(pg_temp.sid(), pg_temp.cid(89403), 4),
  'a duplicate close is a no-op');
select throws_ok($$select private.meet_ai_self_v1_close_stream(pg_temp.sid(), pg_temp.cid(89403), 2)$$,
  '40001', null, 'an older close is refused');
select throws_ok($$select private.meet_ai_self_v1_end_upload(pg_temp.sid(), pg_temp.cid(89403), 9, 'allow')$$,
  '23514', null, 'the shared ending helper never records a decision');
select throws_ok($$select pg_temp.decide(89403, 'allow', 4)$$, '40001', null,
  'decisions share the watermark advanced by close');
select throws_ok($$insert into private.meet_ai_consents(session_id, user_id, decision, notice_version, room_seq)
  values (pg_temp.sid(), pg_temp.cid(89403), 'allow', 'v1', 4)$$, '40001', null,
  'direct consent inserts are ordered against the same watermark');
select is(pg_temp.decide(89403, 'allow', 5), '3/true', 'a fresh allow after withdraw is recorded');
select throws_ok($$insert into private.meet_ai_consents(session_id, user_id, decision, notice_version)
  values (pg_temp.sid(), pg_temp.cid(89403), 'allow', 'v1')$$, '23514', null,
  'a self_v1 allow without a room sequence number is refused');
select ok(has_table_privilege('service_role', 'private.meet_ai_self_v1_room_ops', 'INSERT')
  and not has_table_privilege('service_role', 'private.meet_ai_self_v1_room_ops', 'DELETE')
  and not has_table_privilege('service_role', 'private.meet_ai_self_v1_room_ops', 'UPDATE'),
  'the service role appends room entries but never deletes or rewrites them');
select throws_ok($$insert into private.meet_ai_consents(session_id, user_id, decision, notice_version, room_seq)
  values (pg_temp.cid(89433), pg_temp.cid(89403), 'allow', 'v1', 1)$$, '23514', null,
  'legacy sessions take no room sequence numbers');
select lives_ok($$insert into private.meet_ai_consents(session_id, user_id, decision, notice_version)
  values (pg_temp.cid(89433), pg_temp.cid(89403), 'allow', 'v1')$$,
  'legacy consent inserts are unchanged');

-- Allow cap: 10 allow decisions per account; withdraw always commits.
select pg_temp.decide(89406, case when n % 2 = 1 then 'allow' else 'withdraw' end, n)
  from generate_series(1, 19) n;
select throws_ok($$select pg_temp.decide(89406, 'allow', 21)$$, '54000', null,
  'an eleventh allow is refused');
select is(pg_temp.decide(89406, 'withdraw', 22), '20/true', 'withdraw commits after the allow cap');
select is(pg_temp.decide(89406, 'deny', 23), '21/true', 'deny is never capped');
select is((select count(*)::int from private.meet_ai_consents where session_id = pg_temp.sid()
  and user_id = pg_temp.cid(89406) and decision = 'allow'), 10, 'exactly 10 allow decisions are kept');

-- Stream open, renewal, one live stream per account, lease expiry (account B).
select throws_ok($$select pg_temp.open(89404, 0)$$, '55000', null,
  'a stream needs a current allow decision');
select is(pg_temp.decide(89404, 'allow', 1), '1/true', 'B allows');
select throws_ok($$select pg_temp.open(89404, 2)$$, '55000', null,
  'a stream needs the exact current allow revision');
select throws_ok($$select pg_temp.open(89404, 1, 2)$$, '40001', null,
  'a stale room generation is refused');
select set_config('test.s1', pg_temp.open(89404, 1)::text, true);
select ok((select state = 'active' and lease_expires_at = now() + interval '60 seconds'
    and input_processing = 'processed_aec'
  from private.meet_ai_capture_streams where id = current_setting('test.s1')::uuid),
  'open_stream starts a processed-AEC stream with a 60-second lease');
select ok(exists (select 1 from private.meet_ai_session_participants
  where session_id = pg_temp.sid() and account_id = pg_temp.cid(89404) and consent_revision = 1),
  'open_stream records the admission');
select set_config('test.s2', pg_temp.open(89404, 1)::text, true);
select is((select state from private.meet_ai_capture_streams where id = current_setting('test.s1')::uuid),
  'closed', 'a second open closes the first stream');
select is((select count(*)::int from private.meet_ai_capture_streams where session_id = pg_temp.sid()
  and account_id = pg_temp.cid(89404) and state in ('active', 'draining')), 1,
  'one live stream per account');
select is(private.meet_ai_self_v1_renew_stream(current_setting('test.s2')::uuid, pg_temp.cid(89404)),
  now() + interval '60 seconds', 'renewal extends the lease');
select throws_ok($$select private.meet_ai_self_v1_renew_stream(current_setting('test.s2')::uuid,
  pg_temp.cid(89403))$$, 'P0002', null, 'a stream id never renews for another account');
update private.meet_ai_capture_streams set lease_expires_at = now() - interval '1 second'
  where id = current_setting('test.s2')::uuid;
select throws_ok($$select pg_temp.reserve(89450, current_setting('test.s2')::uuid, 89404, 0, 1, 1)$$,
  '55000', null, 'an expired lease refuses chunks');
select throws_ok($$select private.meet_ai_self_v1_renew_stream(current_setting('test.s2')::uuid,
  pg_temp.cid(89404))$$, '55000', null, 'an expired lease cannot be renewed');
select set_config('test.s3', pg_temp.open(89404, 1)::text, true);

-- Reservation, cap and idempotency.
select ok((select status = 'processing' and reservation_state = 'reserved' and reserved_cost_usd = 1
  from pg_temp.reserve(89451, current_setting('test.s3')::uuid, 89404, 0, 1, 1.00)),
  'a reserved chunk is processing with its own reservation');
select is(pg_temp.costs(), '1.00/0.00/0.00', 'the session reserves the chunk maximum');
select ok((select chunk_count = 1 and audio_seconds = 5 from private.meet_ai_session_participants
  where session_id = pg_temp.sid() and account_id = pg_temp.cid(89404))
  and (select uploaded_count = 1 and highest_sequence = 0 from private.meet_ai_capture_streams
  where id = current_setting('test.s3')::uuid), 'participant and stream counters advance');
select is((pg_temp.reserve(89451, current_setting('test.s3')::uuid, 89404, 0, 1, 1.00)).id,
  pg_temp.cid(89451), 'an exact duplicate returns the existing chunk');
select is(pg_temp.costs(), '1.00/0.00/0.00', 'a duplicate reserves nothing more');
select throws_ok($$select pg_temp.reserve(89451, current_setting('test.s3')::uuid, 89404, 0, 1, 1, 'x')$$,
  '23505', null, 'the same identity with another digest is refused');
select throws_ok($$select pg_temp.reserve(89459, current_setting('test.s3')::uuid, 89404, 0, 1, 1)$$,
  '23505', null, 'another chunk id cannot take a used stream sequence');
select throws_ok($$select pg_temp.reserve(89458, current_setting('test.s3')::uuid, 89404, 9, 2, 1)$$,
  '55000', null, 'a chunk under a revision the account does not hold is refused');
select throws_ok($$select pg_temp.reserve(89457, current_setting('test.s3')::uuid, 89405, 9, 1, 1)$$,
  '55000', null, 'an account that is not admitted cannot reserve');
select lives_ok($$select pg_temp.reserve(89452, current_setting('test.s3')::uuid, 89404, 1, 1, 19.00)$$,
  'a reservation up to the cap is accepted');
select throws_ok($$select pg_temp.reserve(89453, current_setting('test.s3')::uuid, 89404, 2, 1, 0.01)$$,
  '54000', null, 'a reservation beyond the session cost cap is refused');

-- Settlement moves each reservation exactly once.
select throws_ok($$select pg_temp.settle(89452, 'completed', 'text', null, 0.1)$$, '55000', null,
  'completed is refused without a dispatch revision');
select throws_ok($$update public.meet_ai_chunks set status = 'completed', transcript = 'text'
  where id = pg_temp.cid(89452)$$, '55000', null,
  'the chunk guard refuses completed text without a dispatch revision');
select is((pg_temp.settle(89452, 'released')).status, 'failed', 'an undispatched chunk is released');
select is(pg_temp.costs(), '1.00/0.00/0.00', 'release frees exactly its reservation');
select is((pg_temp.settle(89452, 'released')).reservation_state, 'released', 'release is idempotent');
select is(pg_temp.costs(), '1.00/0.00/0.00', 'a repeated release moves nothing');
select ok((select dispatch_consent_revision = 1 and attempts = 2
  from private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89451), pg_temp.cid(89404), 1)),
  'mark_dispatch records the revision and counts the attempt');
select throws_ok($$select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89451), pg_temp.cid(89404), 1)$$,
  '55000', null, 'a dispatched chunk is never dispatched again');
select throws_ok($$select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89451), pg_temp.cid(89403), 1)$$,
  'P0002', null, 'dispatch is bound to the uploader');
select throws_ok($$select pg_temp.settle(89451, 'released')$$, '55000', null,
  'a dispatched chunk cannot be released');
select throws_ok($$select pg_temp.settle(89451, 'completed', 'hello', null, 1.01)$$, '23514', null,
  'a settled cost above the chunk reservation is refused');
select is((pg_temp.settle(89451, 'completed', 'hello', '{"inputTokens": 3}', 0.40)).status, 'completed',
  'a dispatched chunk completes under the current revision');
select is(pg_temp.costs(), '0.00/0.00/0.40', 'completion settles the measured cost');
select is((pg_temp.settle(89451, 'completed', 'hello', '{"inputTokens": 3}', 0.40)).status, 'completed',
  'a repeated completion is idempotent');
select is(pg_temp.costs(), '0.00/0.00/0.40', 'a repeated completion moves nothing');
select throws_ok($$select pg_temp.settle(89451, 'discarded', null, null, 0.4)$$, '55000', null,
  'a settled chunk cannot change outcome');
select pg_temp.reserve(89454, current_setting('test.s3')::uuid, 89404, 2, 1, 2.00);
select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89454), pg_temp.cid(89404), 1);
select throws_ok($$select pg_temp.settle(89454, 'unknown', 'text')$$, '23514', null,
  'unknown outcomes keep no text');
select is((pg_temp.settle(89454, 'unknown')).reservation_state, 'unknown',
  'an unknown outcome keeps the reservation');
select is(pg_temp.costs(), '0.00/2.00/0.40', 'unknown moves the full reservation to unknown cost');
select lives_ok($$select pg_temp.settle(89454, 'unknown')$$, 'a repeated unknown is idempotent');
select is(pg_temp.costs(), '0.00/2.00/0.40', 'a repeated unknown moves nothing');
select pg_temp.reserve(89455, current_setting('test.s3')::uuid, 89404, 3, 1, 1.50);
select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89455), pg_temp.cid(89404), 1);
select throws_ok($$select pg_temp.settle(89455, 'discarded', 'leak', null, 0.3)$$, '23514', null,
  'discarded chunks refuse transcript text');
select throws_ok($$select pg_temp.settle(89455, 'discarded', null,
  '{"segments": [{"transcript": "leak"}]}', 0.3)$$, '23514', null,
  'discarded chunks refuse usage segment text');
select throws_ok($$select pg_temp.settle(89455, 'discarded', null, '{"words": ["leak"]}', 0.3)$$, '23514',
  null, 'discarded usage refuses word arrays');
select throws_ok($$select pg_temp.settle(89455, 'discarded', null,
  '{"utterances": {"speaker": 1, "said": "leak"}}', 0.3)$$, '23514', null,
  'discarded usage refuses nested utterance text');
select throws_ok($$select pg_temp.settle(89455, 'discarded', null, '{"output": "leak"}', 0.3)$$, '23514',
  null, 'discarded usage refuses free-text output');
select throws_ok($$select pg_temp.settle(89455, 'discarded', null, '[1, 2]', 0.3)$$, '23514', null,
  'discarded usage refuses a top-level array');
select is((pg_temp.settle(89455, 'discarded', null,
  '{"inputTokens": 9, "model": "gemini", "details": {"cachedTokens": 1}}', 0.30)).status, 'discarded',
  'a discarded chunk keeps only text-free usage');
select is(pg_temp.costs(), '0.00/2.00/0.70', 'discard settles the measured cost');

-- Withdraw fences dispatch and completion; erasure still clears text.
select pg_temp.reserve(89456, current_setting('test.s3')::uuid, 89404, 4, 1, 1.00);
select pg_temp.reserve(89457, current_setting('test.s3')::uuid, 89404, 5, 1, 1.00);
select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89456), pg_temp.cid(89404), 1);
select is(pg_temp.decide(89404, 'withdraw', 2), '2/true', 'B withdraws');
select throws_ok($$select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89457), pg_temp.cid(89404), 1)$$,
  '55000', null, 'mark_dispatch is refused after withdraw');
select throws_ok($$select pg_temp.settle(89456, 'completed', 'late', null, 0.2)$$, '55000', null,
  'completed text is refused after withdraw');
select is((pg_temp.settle(89456, 'discarded', null, null, 0.20)).status, 'discarded',
  'in-flight text after withdraw is discarded');
select is((pg_temp.settle(89457, 'released')).status, 'failed', 'the undispatched chunk is released');
select is(pg_temp.costs(), '0.00/2.00/0.90', 'counters stay exact across every outcome');
select lives_ok($$update public.meet_ai_chunks set usage = '{"erased": true}'::jsonb
  where id = pg_temp.cid(89451)$$, 'an erasure marker without text is allowed after withdraw');
select lives_ok($$update public.meet_ai_chunks set transcript = null, usage = null
  where id = pg_temp.cid(89451)$$, 'an erasure update clearing text is allowed after withdraw');
select throws_ok($$update public.meet_ai_chunks set transcript = 'rewritten'
  where id = pg_temp.cid(89451)$$, '55000', null, 'new text is refused after withdraw');
select throws_ok($$update public.meet_ai_chunks set status = 'processing'
  where id = pg_temp.cid(89451)$$, '55000', null, 'chunk outcomes are terminal');
select throws_ok($$update public.meet_ai_chunks set reserved_cost_usd = 0
  where id = pg_temp.cid(89451)$$, '55000', null, 'a reservation amount is immutable');

-- Inserts are processing only; close is not permanent; revoke is.
select set_config('test.sa', pg_temp.open(89403, 3)::text, true);
select throws_ok($$insert into public.meet_ai_chunks(id, session_id, sequence, start_seconds,
  duration_seconds, status, transcript, stream_id, account_id, source_kind, content_digest, start_ms,
  end_ms, timing_uncertainty_ms, start_sample, capture_consent_revision, erase_generation,
  transcript_revision) values (gen_random_uuid(), pg_temp.sid(), 0, 0, 5, 'completed', 'text',
  current_setting('test.sa')::uuid, pg_temp.cid(89403), 'microphone', sha256('a'::bytea), 0, 5000,
  0, 0, 3, 0, 0)$$, '23514', null, 'self_v1 chunks are inserted processing only');
select throws_ok($$insert into public.meet_ai_chunks(id, session_id, sequence, start_seconds,
  duration_seconds, status, stream_id, account_id, source_kind, content_digest, start_ms,
  end_ms, timing_uncertainty_ms, start_sample, capture_consent_revision, erase_generation,
  transcript_revision) values (gen_random_uuid(), pg_temp.sid(), 0, 0, 5, 'processing',
  current_setting('test.sa')::uuid, pg_temp.cid(89403), 'microphone', sha256('a'::bytea), 0, 5000,
  0, 0, 3, 0, 0)$$, '23514', null, 'direct self_v1 inserts need a reservation');
select throws_ok($$insert into public.meet_ai_chunks(id, session_id, sequence, start_seconds,
  duration_seconds, status) values (pg_temp.cid(89460), pg_temp.cid(89433), 9, 0, 8, 'discarded')$$,
  '23514', null, 'legacy chunks are never discarded');
select ok(private.meet_ai_self_v1_close_stream(pg_temp.sid(), pg_temp.cid(89403), 6), 'A leaves');
select is((select state from private.meet_ai_capture_streams where id = current_setting('test.sa')::uuid),
  'closed', 'close ends the live stream');
select lives_ok($$select pg_temp.open(89403, 3)$$, 'close is not permanent: A reopens under the same allow');
select ok(private.meet_ai_self_v1_revoke_upload(pg_temp.sid(), pg_temp.cid(89403), 7), 'A is removed');
select ok((select upload_revoked_at is not null from private.meet_ai_session_participants
  where session_id = pg_temp.sid() and account_id = pg_temp.cid(89403))
  and not exists (select 1 from private.meet_ai_capture_streams where session_id = pg_temp.sid()
    and account_id = pg_temp.cid(89403) and state in ('active', 'draining')),
  'revoke sets upload_revoked_at and revokes the live stream');
select ok(not private.meet_ai_self_v1_revoke_upload(pg_temp.sid(), pg_temp.cid(89403), 7),
  'a duplicate revoke is a no-op');
select ok(private.meet_ai_self_v1_revoke_upload(pg_temp.sid(), pg_temp.cid(89403), 3),
  'a revoke at an older room_seq is still recorded, never refused as stale');
select is(pg_temp.decide(89403, 'allow', 8), '4/true', 'a later allow is still recorded');
select throws_ok($$select pg_temp.open(89403, 4)$$, '55000', null, 'revoke is permanent for the session');
select ok(private.meet_ai_self_v1_revoke_upload(pg_temp.sid(), pg_temp.cid(89405), 1),
  'an account can be revoked before admission');
select is(pg_temp.decide(89405, 'allow', 2), '1/true', 'C allows after removal');
select throws_ok($$select pg_temp.open(89405, 1)$$, '55000', null,
  'a revoke before admission still refuses capture');
select private.record_meet_ai_self_v1_admission(pg_temp.sid(), pg_temp.cid(89405), 1);
select throws_ok($$insert into private.meet_ai_capture_streams(session_id, account_id, device_epoch,
  input_processing, lease_expires_at) values (pg_temp.sid(), pg_temp.cid(89405), 1, 'processed_aec',
  now() + interval '60 seconds')$$, '55000', null,
  'a direct stream insert is refused after a revoke recorded before admission');

-- Legacy reservation unaffected.
select ok((select status = 'processing' and stream_id is null and reservation_state is null
  from public.reserve_meet_ai_chunk(pg_temp.cid(89461), pg_temp.cid(89433), 0, 0, 8)),
  'the legacy reservation still reserves legacy chunks');
select ok((select public.reserve_meet_ai_chunk(pg_temp.cid(89461), pg_temp.cid(89433), 0, 0, 8)) is null,
  'the legacy in-flight duplicate still returns null');
select throws_ok($$select public.reserve_meet_ai_chunk(pg_temp.cid(89462), pg_temp.sid(), 0, 0, 8)$$,
  '55000', null, 'the legacy reservation still refuses self_v1 sessions');
select throws_ok($$select private.meet_ai_self_v1_reserve_chunk(pg_temp.cid(89463), pg_temp.cid(89433),
  current_setting('test.s3')::uuid, pg_temp.cid(89404), 0, 0, 0, 5000, sha256('l'::bytea), 1, 5, 1)$$,
  'P0002', null, 'the capture path refuses legacy sessions');

-- Lease expiry, close and revoke fence dispatch of chunks reserved earlier.
-- A fenced chunk stays reserved until it is released; a duplicate never re-arms it.
select is(pg_temp.decide(89409, 'allow', 1), '1/true', 'G allows');
select set_config('test.sg', pg_temp.open(89409, 1)::text, true);
select pg_temp.reserve(89491, current_setting('test.sg')::uuid, 89409, 0, 1, 1.00);
select pg_temp.reserve(89492, current_setting('test.sg')::uuid, 89409, 1, 1, 1.00);
select is(pg_temp.costs(), '2.00/2.00/0.90', 'G reserves two chunks');
update private.meet_ai_capture_streams set lease_expires_at = now() - interval '1 second'
  where id = current_setting('test.sg')::uuid;
select throws_ok($$select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89491), pg_temp.cid(89409), 1)$$,
  '55000', null, 'lease expiry before dispatch refuses dispatch');
update private.meet_ai_capture_streams set lease_expires_at = now() + interval '60 seconds'
  where id = current_setting('test.sg')::uuid;
select ok(private.meet_ai_self_v1_close_stream(pg_temp.sid(), pg_temp.cid(89409), 2), 'G leaves');
select throws_ok($$select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89491), pg_temp.cid(89409), 1)$$,
  '55000', null, 'close before dispatch refuses dispatch');
select ok((select reservation_state = 'reserved' and status = 'processing' and attempts = 1
    and dispatch_consent_revision is null
  from pg_temp.reserve(89491, current_setting('test.sg')::uuid, 89409, 0, 1, 1.00)),
  'an exact duplicate after close returns the chunk unchanged');
select throws_ok($$select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89491), pg_temp.cid(89409), 1)$$,
  '55000', null, 'a duplicate after close does not re-arm dispatch');
select throws_ok($$select pg_temp.reserve(89493, current_setting('test.sg')::uuid, 89409, 2, 1, 1.00)$$,
  '55000', null, 'a closed stream takes no new reservation');
select throws_ok($$update public.meet_ai_chunks set dispatch_consent_revision = 1
  where id = pg_temp.cid(89491)$$, '55000', null, 'a direct dispatch write is fenced like the RPC');
select is((pg_temp.settle(89491, 'released')).reservation_state, 'released',
  'a chunk fenced by close is released');
select is((pg_temp.settle(89492, 'released')).reservation_state, 'released',
  'a second fenced chunk is released');
select is(pg_temp.costs(), '0.00/2.00/0.90', 'releasing fenced chunks frees their reservations');
select is(pg_temp.decide(89410, 'allow', 1), '1/true', 'H allows');
select set_config('test.sh', pg_temp.open(89410, 1)::text, true);
select pg_temp.reserve(89494, current_setting('test.sh')::uuid, 89410, 0, 1, 1.00);
select ok(private.meet_ai_self_v1_revoke_upload(pg_temp.sid(), pg_temp.cid(89410), 2), 'H is removed');
select throws_ok($$select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89494), pg_temp.cid(89410), 1)$$,
  '55000', null, 'revoke before dispatch refuses dispatch');
select ok((select reservation_state = 'reserved' and dispatch_consent_revision is null
  from pg_temp.reserve(89494, current_setting('test.sh')::uuid, 89410, 0, 1, 1.00)),
  'an exact duplicate after revoke returns the chunk unchanged');
select throws_ok($$select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89494), pg_temp.cid(89410), 1)$$,
  '55000', null, 'a duplicate after revoke does not re-arm dispatch');
select throws_ok($$select pg_temp.reserve(89495, current_setting('test.sh')::uuid, 89410, 1, 1, 1.00)$$,
  '55000', null, 'a revoked account takes no new reservation');
select is((pg_temp.settle(89494, 'released')).reservation_state, 'released',
  'a chunk fenced by revoke is released');
select is(pg_temp.costs(), '0.00/2.00/0.90', 'every fenced reservation is freed exactly once');

-- Erase generation: text from before an erasure can only be discarded.
select is(pg_temp.decide(89411, 'allow', 1), '1/true', 'I allows');
select set_config('test.si', pg_temp.open(89411, 1)::text, true);
select pg_temp.reserve(89496, current_setting('test.si')::uuid, 89411, 0, 1, 1.00);
select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89496), pg_temp.cid(89411), 1);
select pg_temp.reserve(89497, current_setting('test.si')::uuid, 89411, 1, 1, 1.00);
update public.meet_ai_sessions set erase_generation = erase_generation + 1 where id = pg_temp.sid();
select throws_ok($$select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89497), pg_temp.cid(89411), 1)$$,
  '55000', null, 'no dispatch at an older erase generation');
select throws_ok($$select pg_temp.settle(89496, 'completed', 'old', null, 0.1)$$, '55000', null,
  'no completed text at an older erase generation');
select is((pg_temp.settle(89496, 'discarded', null, null, 0.10)).status, 'discarded',
  'text from an older erase generation is discarded');
select is((pg_temp.settle(89497, 'released')).reservation_state, 'released',
  'the undispatched older-generation chunk is released');

-- Account-deletion fence: no reservation, dispatch or completed text after it.
select pg_temp.reserve(89498, current_setting('test.si')::uuid, 89411, 2, 1, 1.00);
select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89498), pg_temp.cid(89411), 1);
select pg_temp.reserve(89499, current_setting('test.si')::uuid, 89411, 3, 1, 1.00);
insert into private.meet_ai_account_fences(account_id, reason, expires_at)
  values (pg_temp.cid(89411), 'account_deletion', now() + interval '30 days');
select throws_ok($$select pg_temp.reserve(89500, current_setting('test.si')::uuid, 89411, 4, 1, 1.00)$$,
  '55000', null, 'a fenced account reserves nothing');
select throws_ok($$select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89499), pg_temp.cid(89411), 1)$$,
  '55000', null, 'a fenced account dispatches nothing');
select throws_ok($$select pg_temp.settle(89498, 'completed', 'late', null, 0.1)$$, '55000', null,
  'completed text after an account fence is refused');
select is((pg_temp.settle(89498, 'discarded', null, null, 0.10)).status, 'discarded',
  'in-flight text after an account fence is discarded');
select is((pg_temp.settle(89499, 'released')).reservation_state, 'released',
  'the fenced undispatched chunk is released');

-- A pending person erasure fences capture; its completion erases room entries.
select is(pg_temp.decide(89412, 'allow', 1), '1/true', 'J allows');
select set_config('test.sj', pg_temp.open(89412, 1)::text, true);
select pg_temp.reserve(89503, current_setting('test.sj')::uuid, 89412, 0, 1, 1.00);
insert into private.meet_ai_erasure_jobs(id, operation_id, scope, session_id, subject_account_id,
  subject_digest, requested_by, fence_generation, expires_at)
  values (pg_temp.cid(89505), gen_random_uuid(), 'person_session', pg_temp.sid(), pg_temp.cid(89412),
    sha256('j'::bytea), 'subject', 1, now() + interval '30 days');
select throws_ok($$select pg_temp.reserve(89504, current_setting('test.sj')::uuid, 89412, 1, 1, 1.00)$$,
  '55000', null, 'a pending person erasure fences reservation');
select throws_ok($$select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89503), pg_temp.cid(89412), 1)$$,
  '55000', null, 'a pending person erasure fences dispatch');
select is((pg_temp.settle(89503, 'released')).reservation_state, 'released',
  'the chunk fenced by erasure is released');
update private.meet_ai_erasure_jobs set status = 'completed', completed_at = now()
  where id = pg_temp.cid(89505);
select ok(not exists (select 1 from private.meet_ai_self_v1_room_ops
  where session_id = pg_temp.sid() and account_id = pg_temp.cid(89412)),
  'a completed person erasure removes that person''s room entries');
select is(pg_temp.costs(), '0.00/2.00/1.10', 'fenced and discarded chunks keep the counters exact');

-- Auth deletion anonymizes consent rows and removes the room entries that
-- would link them back to the account.
delete from auth.users where id = pg_temp.cid(89406);
select ok(not exists (select 1 from private.meet_ai_self_v1_room_ops
    where account_id = pg_temp.cid(89406))
  and not exists (select 1 from private.meet_ai_consents where user_id = pg_temp.cid(89406)),
  'anonymization leaves no room entry for the deleted account');

-- Notes attempts: at most 3 per session.
select is(private.meet_ai_self_v1_note_attempt(pg_temp.sid()), 1, 'first notes attempt');
select is(private.meet_ai_self_v1_note_attempt(pg_temp.sid()), 2, 'second notes attempt');
select is(private.meet_ai_self_v1_note_attempt(pg_temp.sid()), 3, 'third notes attempt');
select throws_ok($$select private.meet_ai_self_v1_note_attempt(pg_temp.sid())$$, '54000', null,
  'a fourth notes attempt is refused');

-- Soft stop drains for 20 seconds, then closes.
select is(pg_temp.decide(89407, 'allow', 1), '1/true', 'E allows');
select set_config('test.se', pg_temp.open(89407, 1)::text, true);
select throws_ok($$select private.meet_ai_self_v1_stop_session(pg_temp.sid(), pg_temp.cid(89403), false)$$,
  '42501', null, 'only the host stops capture');
select ok((select capture_state = 'draining' and cutoff_at = now()
    and drain_deadline_at = now() + interval '20 seconds' and stop_generation = 1
  from private.meet_ai_self_v1_stop_session(pg_temp.sid(), pg_temp.cid(89402), false)),
  'soft stop drains with a 20-second deadline');
select is((private.meet_ai_self_v1_stop_session(pg_temp.sid(), pg_temp.cid(89402), false)).stop_generation,
  1, 'a repeated soft stop changes nothing');
select is((select state from private.meet_ai_capture_streams where id = current_setting('test.se')::uuid),
  'draining', 'live streams drain');
select throws_ok($$select pg_temp.open(89407, 1)$$, '55000', null, 'no stream opens while draining');
select throws_ok($$select pg_temp.reserve(89473, current_setting('test.se')::uuid, 89407, 1, 1, 1)$$,
  '55000', null, 'speech captured after the stop cutoff is refused while draining');
select lives_ok($$select private.meet_ai_self_v1_reserve_chunk(pg_temp.cid(89471), pg_temp.sid(),
  current_setting('test.se')::uuid, pg_temp.cid(89407), 0, 0, 0, 1500, sha256('e'::bytea), 1, 1.5, 1)$$,
  'speech captured before the stop cutoff is admitted while draining');
select is((private.meet_ai_self_v1_close_drained(pg_temp.sid())).capture_state, 'draining',
  'close_drained waits for the drain deadline');
update public.meet_ai_sessions set drain_deadline_at = cutoff_at where id = pg_temp.sid();
select throws_ok($$select pg_temp.reserve(89472, current_setting('test.se')::uuid, 89407, 1, 1, 1)$$,
  '55000', null, 'chunks are refused after the drain deadline');
select throws_ok($$select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89471), pg_temp.cid(89407), 1)$$,
  '55000', null, 'no dispatch starts after the drain deadline');
select ok((select capture_state = 'closed' and ended_at is not null
  from private.meet_ai_self_v1_close_drained(pg_temp.sid())), 'close_drained closes after the deadline');
select is((select state from private.meet_ai_capture_streams where id = current_setting('test.se')::uuid),
  'closed', 'closing ends every stream');
select is((select reservation_state from public.meet_ai_chunks where id = pg_temp.cid(89471)), 'released',
  'close_drained releases undispatched reservations');
update public.meet_ai_sessions set transcript_purged_at = now() where id = pg_temp.sid();
select ok(not exists (select 1 from private.meet_ai_self_v1_room_ops where session_id = pg_temp.sid()),
  'a transcript purge removes the session''s room entries');

-- Hard stop closes at once; nothing reserved before it is dispatched.
select set_config('test.sid', (private.meet_ai_self_v1_start_session(pg_temp.cid(89422),
  pg_temp.cid(89402), pg_temp.cid(89411))).id::text, true);
select is(pg_temp.decide(89408, 'allow', 1), '1/true', 'F allows');
select set_config('test.sf', pg_temp.open(89408, 1)::text, true);
select pg_temp.reserve(89481, current_setting('test.sf')::uuid, 89408, 0, 1, 1);
select pg_temp.reserve(89483, current_setting('test.sf')::uuid, 89408, 1, 1, 1);
select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89483), pg_temp.cid(89408), 1);
select ok((select capture_state = 'closed' and ended_at is not null and cutoff_at is not null
    and stop_generation = 1
  from private.meet_ai_self_v1_stop_session(pg_temp.sid(), pg_temp.cid(89402), true)),
  'hard stop closes at once');
select is((private.meet_ai_self_v1_stop_session(pg_temp.sid(), pg_temp.cid(89402), true)).stop_generation,
  1, 'a repeated hard stop changes nothing');
select throws_ok($$select private.meet_ai_self_v1_mark_dispatch(pg_temp.cid(89481), pg_temp.cid(89408), 1)$$,
  '55000', null, 'no provider dispatch starts after a hard stop');
select is((select reservation_state from public.meet_ai_chunks where id = pg_temp.cid(89481)), 'released',
  'hard stop releases the undispatched reservation');
select is((pg_temp.settle(89481, 'released')).reservation_state, 'released',
  'a repeated release after stop is a no-op');
select is((select reservation_state from public.meet_ai_chunks where id = pg_temp.cid(89483)), 'reserved',
  'a dispatched chunk keeps its reservation until it settles');
select is((pg_temp.settle(89483, 'unknown')).reservation_state, 'unknown',
  'a dispatched chunk lost at stop is settled as unknown');
select is(pg_temp.costs(), '0.00/1.00/0.00', 'only the dispatched chunk counts after stop');
select throws_ok($$select pg_temp.reserve(89482, current_setting('test.sf')::uuid, 89408, 1, 1, 1)$$,
  '55000', null, 'a closed session admits no chunks');
select * from finish();
rollback;
