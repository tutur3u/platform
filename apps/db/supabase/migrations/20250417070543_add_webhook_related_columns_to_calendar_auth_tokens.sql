drop policy " Enable all access for challenge manager" on "public"."nova_challenge_criteria";

drop policy "Enable all access for challenge manager" on "public"."nova_challenge_whitelisted_emails";

drop policy "Enable all access for challenge manager" on "public"."nova_challenges";

drop policy " Enable all access for challenge manager" on "public"."nova_problem_criteria_scores";

drop policy " Enable all access for challenge manager" on "public"."nova_problem_test_cases";

drop policy " Enable all access for challenge manager" on "public"."nova_problems";

drop policy "Enable all access for role manager" on "public"."nova_roles";

drop policy "Enable current user to see their role" on "public"."nova_roles";

drop policy "Enable all access for current user" on "public"."nova_sessions";

drop policy " Enable all access for challenge manager" on "public"."nova_submission_outputs";

drop policy "Enable all access for current user" on "public"."nova_submissions";

drop policy "Allow all access for nova admins" on "public"."nova_team_emails";

drop policy "Allow all access for nova admins" on "public"."nova_team_members";

drop policy "Allow all access for nova admins" on "public"."nova_teams";

alter table "public"."nova_roles" drop constraint "nova_roles_email_citext_unique";

drop function if exists "public"."is_nova_challenge_manager"();

drop index if exists "public"."nova_roles_email_citext_unique";

alter table "public"."calendar_auth_tokens" add column "expiration_time" timestamp without time zone default now();

alter table "public"."calendar_auth_tokens" add column "resource_id" text;

alter table "public"."calendar_auth_tokens" add column "sync_token" text;

alter table "public"."nova_roles" alter column "allow_challenge_management" drop not null;

alter table "public"."nova_roles" alter column "allow_role_management" drop not null;

alter table "public"."nova_roles" alter column "email" set data type text using "email"::text;

alter table "public"."nova_roles" alter column "enabled" drop not null;

alter table "public"."workspace_calendar_events" drop column "priority";

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
on "public"."nova_challenge_whitelisted_emails"
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
on "public"."nova_problem_test_cases"
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


create policy "Enable all access for current user"
on "public"."nova_sessions"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


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


create policy "Enable all access for current user"
on "public"."nova_submissions"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Allow all access for nova admins"
on "public"."nova_team_emails"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_role_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_role_management = true)))));


create policy "Allow all access for nova admins"
on "public"."nova_team_members"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_role_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_role_management = true)))));


create policy "Allow all access for nova admins"
on "public"."nova_teams"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_role_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_role_management = true)))));



