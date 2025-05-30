create policy "Enable users to view their own data only"
on "public"."course_module_completion_status"
as permissive
for select
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));



