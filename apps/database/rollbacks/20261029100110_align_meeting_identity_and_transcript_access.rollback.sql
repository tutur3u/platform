begin;

drop trigger enforce_workspace_meeting_creator_immutable on public.workspace_meetings;
drop function public.enforce_workspace_meeting_creator_immutable();

grant select on public.meet_ai_sessions, public.meet_ai_chunks to authenticated;
create policy meet_ai_sessions_read on public.meet_ai_sessions for select to authenticated using (
  exists (select 1 from public.workspace_meetings m join public.workspace_members wm on wm.ws_id = m.ws_id
    where m.id = meeting_id and wm.user_id = auth.uid())
);
create policy meet_ai_chunks_read on public.meet_ai_chunks for select to authenticated using (
  exists (select 1 from public.meet_ai_sessions s where s.id = session_id)
);

commit;
