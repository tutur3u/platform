drop policy "Enable all access" on "public"."students";

create policy "Enable all access for authenticated users"
on "public"."students"
as permissive
for all
to authenticated
using (true)
with check (true);



