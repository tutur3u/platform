-- Restore the global (session_id, sequence) key. Self_v1 chunks must already be
-- erased: two streams may share a sequence, which the global key rejects.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
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
  add constraint meet_ai_chunks_session_id_sequence_key unique (session_id, sequence);
commit;
