-- Rollback of 20261124100000_meet_ai_self_v1_capture_path.sql, after the
-- 20261124100100 rollback. Consent evidence is kept; only its room_seq column,
-- key and triggers are removed. Discarded chunks hold no text and become
-- `failed` so the original status check can return. Per-chunk reservations and
-- the room-entry log are dropped; session cost counters stay.
-- Refuses while any self_v1 session is active or draining, or any self_v1
-- chunk is processing or reserved. Reapplying the migration starts the room
-- sequence watermark empty, so an older room entry could land again: end every
-- self_v1 session (stop, then close_drained) before rolling back, and start new
-- sessions only after the reapply.
-- Closing a session (hard stop or close_drained) releases every reservation
-- that was never dispatched. A chunk dispatched but never settled (a lost
-- provider reply) still blocks the rollback: the operator settles it as unknown
-- cost with private.meet_ai_self_v1_settle_chunk(<chunk id>, 'unknown', null,
-- null, null), which keeps its full reservation counted against the cap.
-- Run with psql -X -v ON_ERROR_STOP=1 -f, without -1.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
lock table public.meet_ai_sessions, public.meet_ai_chunks, private.meet_ai_consents,
  private.meet_ai_capture_streams, private.meet_ai_erasure_jobs
  in access exclusive mode;
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
-- Functions of 20261124100100, in case its rollback was skipped.
drop function if exists private.meet_ai_self_v1_close_drained(uuid);
drop function if exists private.meet_ai_self_v1_stop_session(uuid, uuid, boolean);
drop function if exists private.meet_ai_self_v1_release_undispatched(uuid);
drop function if exists private.meet_ai_self_v1_note_attempt(uuid);
drop function if exists private.meet_ai_self_v1_settle_chunk(uuid, text, text, jsonb, numeric);
drop function if exists private.meet_ai_self_v1_mark_dispatch(uuid, uuid, integer);
drop function if exists private.meet_ai_self_v1_reserve_chunk(uuid, uuid, uuid, uuid, integer,
  bigint, bigint, bigint, bytea, integer, numeric, numeric);

drop function if exists private.meet_ai_self_v1_revoke_upload(uuid, uuid, bigint);
drop function if exists private.meet_ai_self_v1_close_stream(uuid, uuid, bigint);
drop function if exists private.meet_ai_self_v1_end_upload(uuid, uuid, bigint, text);
drop function if exists private.meet_ai_self_v1_renew_stream(uuid, uuid);
drop function if exists private.meet_ai_self_v1_open_stream(uuid, uuid, integer, integer);
drop function if exists private.meet_ai_self_v1_record_decision(uuid, uuid, text, text, bigint);
drop function if exists private.meet_ai_self_v1_start_session(uuid, uuid, uuid);
drop function if exists private.meet_ai_self_v1_room_seq_state(uuid, uuid, bigint, text);
drop function if exists private.meet_ai_self_v1_capturing(public.meet_ai_sessions);
drop function if exists private.meet_ai_self_v1_lock_session(uuid);

drop trigger if exists guard_meet_ai_self_v1_stream_revoke on private.meet_ai_capture_streams;
drop function if exists private.guard_meet_ai_self_v1_stream_revoke();
drop trigger if exists guard_meet_ai_self_v1_chunk_state on public.meet_ai_chunks;
drop function if exists private.guard_meet_ai_self_v1_chunk_state();
drop function if exists private.meet_ai_self_v1_lock_live_upload(uuid, uuid, uuid);
drop function if exists private.meet_ai_self_v1_upload_fenced(uuid, uuid);
drop function if exists private.meet_ai_usage_is_text_free(jsonb);
drop trigger if exists erase_meet_ai_self_v1_room_ops on auth.users;
drop trigger if exists erase_meet_ai_self_v1_room_ops on public.meet_ai_sessions;
drop trigger if exists erase_meet_ai_self_v1_room_ops on private.meet_ai_erasure_jobs;
drop function if exists private.erase_meet_ai_self_v1_room_ops();
drop trigger if exists room_seq_meet_ai_self_v1_consent on private.meet_ai_consents;
drop function if exists private.order_meet_ai_self_v1_room_seq();
drop table if exists private.meet_ai_self_v1_room_ops;
drop index if exists private.meet_ai_consents_room_seq_key;
alter table private.meet_ai_consents
  drop constraint if exists meet_ai_consents_room_seq_check,
  drop column if exists room_seq;

update public.meet_ai_chunks set status = 'failed'
  where status = 'discarded' and transcript is null;
alter table public.meet_ai_chunks
  drop constraint if exists meet_ai_chunks_reservation_check,
  drop constraint meet_ai_chunks_status_check,
  add constraint meet_ai_chunks_status_check
    check (status in ('processing', 'completed', 'failed')),
  drop column if exists reserved_cost_usd,
  drop column if exists reservation_state;
notify pgrst, 'reload schema';
commit;
