drop policy "Enable all access for current user" on "public"."nova_sessions";

create policy "Enable all access for challenge managers"
on "public"."nova_sessions"
as permissive
for all
to authenticated
using (is_nova_challenge_manager())
with check (is_nova_challenge_manager());


create policy "Enable all access for current user"
on "public"."nova_sessions"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



