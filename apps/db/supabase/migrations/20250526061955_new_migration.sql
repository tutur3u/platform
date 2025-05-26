create policy "Enable insert for users based on user_id"
on "public"."course_module_completion_status"
as permissive
for insert
to authenticated
with check ((( SELECT auth.uid() AS uid) = user_id));



