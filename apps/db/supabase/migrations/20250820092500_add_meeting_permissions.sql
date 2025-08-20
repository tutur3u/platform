create policy "Allow users to have full permissions"
on "public"."media_uploads"
as permissive
for all
to authenticated
using (true)
with check (true);

create policy "Allow users to have full permissions"
on "public"."recording_transcripts"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM media_uploads mu
  WHERE (mu.id = recording_transcripts.media_upload_id))))
with check ((EXISTS ( SELECT 1
   FROM media_uploads mu
  WHERE (mu.id = recording_transcripts.media_upload_id))));

create policy "Allow users to have full permissions"
on "public"."meeting_notes"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM media_uploads mu
  WHERE (mu.id = meeting_notes.media_upload_id))) OR (EXISTS ( SELECT 1
   FROM recording_transcripts rt
  WHERE (rt.id = meeting_notes.transcript_id))))
with check ((EXISTS ( SELECT 1
   FROM media_uploads mu
  WHERE (mu.id = meeting_notes.media_upload_id))) OR (EXISTS ( SELECT 1
   FROM recording_transcripts rt
  WHERE (rt.id = meeting_notes.transcript_id))));