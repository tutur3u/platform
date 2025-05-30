create policy "Enable update for users based on user_id"
on "public"."course_module_completion_status"
as permissive
for update
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id))
with check ((( SELECT auth.uid() AS uid) = user_id));



