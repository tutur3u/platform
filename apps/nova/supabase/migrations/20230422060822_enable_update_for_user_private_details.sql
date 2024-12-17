create policy "Enable update for users based on email"
on "public"."user_private_details"
as permissive
for update
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



