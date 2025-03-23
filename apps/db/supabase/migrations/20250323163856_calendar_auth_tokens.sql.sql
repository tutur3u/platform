create policy "Allow delete for workspace users and the participant"
on "public"."calendar_auth_tokens"
as permissive
for delete
to public
using ((user_id = auth.uid()));


create policy "Allow insert for workspace users"
on "public"."calendar_auth_tokens"
as permissive
for insert
to authenticated
with check ((user_id = auth.uid()));


create policy "Allow select for workspace users and the participant"
on "public"."calendar_auth_tokens"
as permissive
for select
to authenticated
using ((user_id = auth.uid()));


create policy "Allow update for workspace users and the participant"
on "public"."calendar_auth_tokens"
as permissive
for update
to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



