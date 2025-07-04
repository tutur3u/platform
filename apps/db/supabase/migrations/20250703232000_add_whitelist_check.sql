drop policy "Enable all access for authenticated users" on "public"."students";

create policy "Enable all access for whitelisted users"
on "public"."students"
as permissive
for all
to authenticated
using (EXISTS (SELECT 1 FROM workspace_members WHERE user_id = auth.uid()))
with check (EXISTS (SELECT 1 FROM workspace_members WHERE user_id = auth.uid()));
