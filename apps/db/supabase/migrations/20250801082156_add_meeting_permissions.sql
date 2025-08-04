alter table "public"."workspace_meetings" alter column "ws_id" set not null;

create policy "Allow workspace members to have full permissions"
on "public"."audio_chunks"
as permissive
for all
to public
using ((EXISTS ( SELECT 1
   FROM workspace_meetings wm,
    recording_sessions rs
  WHERE ((rs.meeting_id = wm.id) AND (rs.id = audio_chunks.session_id)))))
with check ((EXISTS ( SELECT 1
   FROM workspace_meetings wm,
    recording_sessions rs
  WHERE ((rs.meeting_id = wm.id) AND (rs.id = audio_chunks.session_id)))));


create policy "Allow workspace members to have full permissions"
on "public"."recording_sessions"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspace_meetings wm
  WHERE (wm.id = recording_sessions.meeting_id))))
with check ((EXISTS ( SELECT 1
   FROM workspace_meetings wm
  WHERE (wm.id = recording_sessions.meeting_id))));


create policy "Allow workspace members to have full permissions"
on "public"."recording_transcripts"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspace_meetings wm,
    recording_sessions rs
  WHERE ((rs.meeting_id = wm.id) AND (rs.id = recording_transcripts.session_id)))))
with check ((EXISTS ( SELECT 1
   FROM workspace_meetings wm,
    recording_sessions rs
  WHERE ((rs.meeting_id = wm.id) AND (rs.id = recording_transcripts.session_id)))));


create policy "Allow workspace members to have full permissions"
on "public"."workspace_meetings"
as permissive
for all
to authenticated
using (is_org_member(auth.uid(), ws_id))
with check (is_org_member(auth.uid(), ws_id));



