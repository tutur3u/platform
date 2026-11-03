-- Manual rollback only with release-authority approval. Run first in the
-- self_v1 rollback order: 150070, 150050, 150040..150010 (each alone), 150000.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
drop function private.set_meet_ai_self_v1_sharing(uuid, uuid, boolean, boolean, integer);
drop function private.record_meet_ai_self_v1_admission(uuid, uuid, integer);
drop function private.list_meet_ai_self_v1_coverage(uuid, uuid);
drop function private.get_meet_ai_self_v1_notes(uuid, uuid);
drop function private.list_meet_ai_self_v1_segments(uuid, uuid, bigint, uuid, uuid, integer, integer);
drop function private.meet_ai_self_v1_reader_role(uuid, uuid);
drop function private.meet_ai_self_v1_notes_redacted(uuid);
drop function private.meet_ai_self_v1_chunk_hidden(uuid, uuid, timestamptz);
drop function private.meet_ai_self_v1_post_call(public.meet_ai_sessions);
notify pgrst, 'reload schema';
commit;
