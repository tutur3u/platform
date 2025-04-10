create policy "Enable all access for challenge manager"
on "public"."nova_challenge_whitelists"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_challenge_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_challenge_management = true)))));



