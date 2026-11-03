-- Manual rollback: pause self_v1 writers and erase their chunks first.
-- Run with psql -X -v ON_ERROR_STOP=1 -f (no -1 / enclosing transaction),
-- as verification/meet-self-v1.sh does for every rollback. Steps: preflight,
-- concurrent build, short locked recheck/attach. On build or attach failure,
-- drop the unattached index concurrently and fail; retry this file after fixing
-- the cause. A killed client may leave the temporary index: the initial DROP
-- removes it on retry. Never run two copies of this rollback concurrently.
\set ON_ERROR_STOP on
set lock_timeout = '5s';
set statement_timeout = '120s';
-- Fixed checks only (no EXECUTE, no interpolation); they can only raise.
-- tuturuuu: reviewed(dynamic-sql-review): no EXECUTE or interpolated SQL
do $$
begin
  if exists (select 1 from public.meet_ai_chunks where stream_id is not null) then
    raise exception 'Erase self_v1 chunks before restoring the global sequence key'
      using errcode = '55000';
  end if;
end;
$$;

drop index concurrently if exists public.meet_ai_chunks_global_sequence_rollback_idx;
\set ON_ERROR_STOP off
create unique index concurrently meet_ai_chunks_global_sequence_rollback_idx
  on public.meet_ai_chunks (session_id, sequence);
\if :ERROR
  \set ON_ERROR_STOP on
  drop index concurrently if exists public.meet_ai_chunks_global_sequence_rollback_idx;
  -- Fail after cleanup so the runner cannot proceed to later rollbacks.
  select 1 / 0 as rollback_index_build_failed;
\endif

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
lock table public.meet_ai_chunks in access exclusive mode;
-- Fixed checks only (no EXECUTE, no interpolation); they can only raise.
-- tuturuuu: reviewed(dynamic-sql-review): no EXECUTE or interpolated SQL
do $$
begin
  if exists (select 1 from public.meet_ai_chunks where stream_id is not null) then
    raise exception 'Erase self_v1 chunks before restoring the global sequence key'
      using errcode = '55000';
  end if;
end;
$$;
alter table public.meet_ai_chunks
  add constraint meet_ai_chunks_session_id_sequence_key
  unique using index meet_ai_chunks_global_sequence_rollback_idx;
\if :ERROR
  rollback;
  \set ON_ERROR_STOP on
  drop index concurrently if exists public.meet_ai_chunks_global_sequence_rollback_idx;
  select 1 / 0 as rollback_index_attach_failed;
\endif
\set ON_ERROR_STOP on
commit;
reset lock_timeout;
reset statement_timeout;
