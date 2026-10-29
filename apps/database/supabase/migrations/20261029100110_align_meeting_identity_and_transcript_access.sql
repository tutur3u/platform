begin;

create function public.enforce_workspace_meeting_creator_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.creator_id is distinct from old.creator_id then
    raise exception using errcode = '42501', message = 'Meeting creator is immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_workspace_meeting_creator_immutable() from public, anon, authenticated;

create trigger enforce_workspace_meeting_creator_immutable
before update of creator_id on public.workspace_meetings
for each row execute function public.enforce_workspace_meeting_creator_immutable();

-- Sharing and participation live in the room service, so transcript reads go
-- through the application gate rather than a membership-only database policy.
revoke select on public.meet_ai_sessions, public.meet_ai_chunks from public, anon, authenticated;
drop policy meet_ai_chunks_read on public.meet_ai_chunks;
drop policy meet_ai_sessions_read on public.meet_ai_sessions;

commit;
