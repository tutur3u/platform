-- Rollback of 20261124114200_meet_ai_self_v1_cost_rpcs.sql. Run this and then
-- the 20261124114100 rollback back-to-back, with no self_v1 session started in
-- between. Session counters and chunk rows are kept.
-- Refuses while any self_v1 session can capture or any self_v1 chunk is in
-- flight, so no reservation is stranded without its settlement RPC.
-- Closing a session (hard stop or close_drained) releases every reservation
-- that was never dispatched. A chunk dispatched but never settled (a lost
-- provider reply) still blocks the rollback: the operator settles it as unknown
-- cost with private.meet_ai_self_v1_settle_chunk(<chunk id>, 'unknown', null,
-- null, null), which keeps its full reservation counted against the cap.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
lock table public.meet_ai_sessions, public.meet_ai_chunks in share row exclusive mode;
-- Fixed checks only (no EXECUTE, no interpolation); they can only raise.
-- tuturuuu: reviewed(dynamic-sql-review): no EXECUTE or interpolated SQL
do $$
begin
  if exists (select 1 from public.meet_ai_sessions
      where protocol = 'self_v1' and capture_state in ('active', 'draining')) then
    raise exception 'End every self_v1 session (stop and close_drained) before rolling back'
      using errcode = '55000';
  end if;
  if exists (select 1 from public.meet_ai_chunks where stream_id is not null
      and (status = 'processing' or reservation_state = 'reserved')) then
    raise exception 'Settle every in-flight self_v1 chunk before rolling back'
      using errcode = '55000';
  end if;
end;
$$;
drop function if exists private.meet_ai_self_v1_close_drained(uuid);
drop function if exists private.meet_ai_self_v1_stop_session(uuid, uuid, boolean);
drop function if exists private.meet_ai_self_v1_release_undispatched(uuid);
drop function if exists private.meet_ai_self_v1_reserve_chunk(uuid, uuid, uuid, uuid, integer,
  bigint, bigint, bigint, bytea, integer, numeric, numeric);
drop function if exists private.meet_ai_self_v1_mark_dispatch(uuid, uuid, integer);
drop function if exists private.meet_ai_self_v1_settle_chunk(uuid, text, text, jsonb, numeric);
drop function if exists private.meet_ai_self_v1_note_attempt(uuid);
notify pgrst, 'reload schema';
commit;
