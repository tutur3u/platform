create policy "Disable access for all users"
on "public"."calendar_sync_states"
as permissive
for all
to public
using (false)
with check (false);



