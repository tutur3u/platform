create policy " Enable all access for Nova Admins"
on "public"."nova_challenge_criteria"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.is_admin = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.is_admin = true)))));


create policy " Enable all access for Nova Admins"
on "public"."nova_problem_criteria_scores"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.is_admin = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.is_admin = true)))));


create policy " Enable all access for Nova Admins"
on "public"."nova_submission_outputs"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.is_admin = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.is_admin = true)))));



