-- IF NOT EXISTS must not accept an invalid index from an interrupted build.
-- Only after every replacement index is valid does the global legacy
-- (session_id, sequence) key give way to per-stream self_v1 identity.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Fixed checks only (no EXECUTE, no interpolation); they can only raise.
-- tuturuuu: reviewed(dynamic-sql-review): no EXECUTE or interpolated SQL
do $$
declare
  required text;
begin
  foreach required in array array[
    'public.meet_ai_chunks_legacy_sequence_key',
    'public.meet_ai_chunks_stream_sequence_key',
    'public.meet_ai_chunks_account_session_idx',
    'public.meet_ai_chunks_timeline_idx'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_index
      where indexrelid = pg_catalog.to_regclass(required)
        and indrelid = 'public.meet_ai_chunks'::regclass and indisvalid
    ) then
      raise exception using errcode = '55000',
        message = format('Required index %s is missing or invalid', required),
        hint = 'Drop the invalid index concurrently outside a transaction, resolve duplicates if applicable, rebuild, and retry.';
    end if;
  end loop;
end;
$$;

alter table public.meet_ai_chunks
  drop constraint meet_ai_chunks_session_id_sequence_key;
