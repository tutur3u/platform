-- Rollback of 20261124100100_meet_ai_self_v1_cost_rpcs.sql. Run before the
-- 20261124100000 rollback. Session counters and chunk rows are kept.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
drop function if exists private.meet_ai_self_v1_reserve_chunk(uuid, uuid, uuid, uuid, integer,
  bigint, bigint, bigint, bytea, integer, numeric, numeric);
drop function if exists private.meet_ai_self_v1_mark_dispatch(uuid, uuid, integer);
drop function if exists private.meet_ai_self_v1_settle_chunk(uuid, text, text, jsonb, numeric);
drop function if exists private.meet_ai_self_v1_note_attempt(uuid);
notify pgrst, 'reload schema';
commit;
