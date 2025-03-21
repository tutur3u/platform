drop policy " Enable all access for Nova Admins" on "public"."nova_challenge_criteria";

drop policy "Allow challenge management" on "public"."nova_challenges";

drop policy "Enable all access for Nova Admins" on "public"."nova_challenges";

drop policy " Enable all access for Nova Admins" on "public"."nova_problem_criteria_scores";

drop policy " Enable all access for Nova Admins" on "public"."nova_problem_testcases";

drop policy " Enable all access for Nova Admins" on "public"."nova_problems";

drop policy "Allow current user to see their role" on "public"."nova_roles";

drop policy "Allow role management" on "public"."nova_roles";

drop policy "Enable all access for Nova Admins" on "public"."nova_roles";

drop policy " Enable all access for Nova Admins" on "public"."nova_submission_outputs";

drop function if exists "public"."nova_user_can_manage_challenges"();

drop function if exists "public"."nova_user_can_manage_roles"();

drop function if exists "public"."nova_user_has_admin_permission"();

alter table "public"."nova_roles" drop column "is_admin";

create policy " Enable all access for challenge manager"
on "public"."nova_challenge_criteria"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_challenge_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_challenge_management = true)))));


create policy "Enable all access for challenge manager"
on "public"."nova_challenges"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_challenge_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_challenge_management = true)))));


create policy " Enable all access for challenge manager"
on "public"."nova_problem_criteria_scores"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_challenge_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_challenge_management = true)))));


create policy " Enable all access for challenge manager"
on "public"."nova_problem_testcases"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_challenge_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_challenge_management = true)))));


create policy " Enable all access for challenge manager"
on "public"."nova_problems"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_challenge_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_challenge_management = true)))));


create policy "Enable all access for role manager"
on "public"."nova_roles"
as permissive
for all
to authenticated
using (((email = auth.email()) AND (allow_role_management = true)));


create policy "Enable current user to see their role"
on "public"."nova_roles"
as permissive
for select
to authenticated
using ((email = auth.email()));


create policy " Enable all access for challenge manager"
on "public"."nova_submission_outputs"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_challenge_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_challenge_management = true)))));



