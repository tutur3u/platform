drop policy " Enable all access for challenge manager" on "public"."nova_challenge_criteria";

drop policy "Enable all access for challenge manager" on "public"."nova_challenge_whitelisted_emails";

drop policy "Enable all access for challenge manager" on "public"."nova_challenges";

drop policy " Enable all access for challenge manager" on "public"."nova_problem_criteria_scores";

drop policy " Enable all access for challenge manager" on "public"."nova_problem_test_cases";

drop policy " Enable all access for challenge manager" on "public"."nova_problems";

drop policy "Enable current user to see their role" on "public"."nova_roles";

drop policy " Enable all access for challenge manager" on "public"."nova_submission_outputs";

drop policy "Allow all access for nova admins" on "public"."nova_team_emails";

drop policy "Allow all access for nova admins" on "public"."nova_team_members";

drop policy "Allow all access for nova admins" on "public"."nova_teams";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.is_nova_challenge_manager()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$begin
  return exists (
    select 1 from public.nova_roles
    where (select auth.email()) = email and allow_challenge_management = true
  );
end;$function$
;

create policy " Enable all access for challenge manager"
on "public"."nova_challenge_criteria"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_challenge_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_challenge_management = true)))));


create policy "Enable all access for challenge manager"
on "public"."nova_challenge_whitelisted_emails"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_challenge_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_challenge_management = true)))));


create policy "Enable all access for challenge manager"
on "public"."nova_challenges"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_challenge_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_challenge_management = true)))));


create policy " Enable all access for challenge manager"
on "public"."nova_problem_criteria_scores"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_challenge_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_challenge_management = true)))));


create policy " Enable all access for challenge manager"
on "public"."nova_problem_test_cases"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_challenge_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_challenge_management = true)))));


create policy " Enable all access for challenge manager"
on "public"."nova_problems"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_challenge_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_challenge_management = true)))));


create policy "Enable current user to see their role"
on "public"."nova_roles"
as permissive
for select
to authenticated
using (((email)::text = auth.email()));


create policy " Enable all access for challenge manager"
on "public"."nova_submission_outputs"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_challenge_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_challenge_management = true)))));


create policy "Allow all access for nova admins"
on "public"."nova_team_emails"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_role_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_role_management = true)))));


create policy "Allow all access for nova admins"
on "public"."nova_team_members"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_role_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_role_management = true)))));


create policy "Allow all access for nova admins"
on "public"."nova_teams"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_role_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE (((nova_roles.email)::text = auth.email()) AND (nova_roles.allow_role_management = true)))));

-- Drop the old column and rename the new one
ALTER TABLE public.nova_roles
DROP COLUMN legacy_email;