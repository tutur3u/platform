drop policy " Enable all access for challenge manager" on "public"."nova_challenge_criteria";

drop policy "Enable all access for challenge manager" on "public"."nova_challenge_whitelisted_emails";

drop policy "Enable all access for challenge manager" on "public"."nova_challenges";

drop policy " Enable all access for challenge manager" on "public"."nova_problem_criteria_scores";

drop policy " Enable all access for challenge manager" on "public"."nova_problem_test_cases";

drop policy " Enable all access for challenge manager" on "public"."nova_problems";

drop policy "Enable all access for current user" on "public"."nova_sessions";

drop policy " Enable all access for challenge manager" on "public"."nova_submission_outputs";

drop policy "Enable all access for current user" on "public"."nova_submissions";

drop policy "Allow all access for nova admins" on "public"."nova_team_emails";

drop policy "Allow all access for nova admins" on "public"."nova_team_members";

drop policy "Allow all access for nova admins" on "public"."nova_teams";

create policy " Enable all access for challenge manager"
on "public"."nova_challenge_criteria"
as permissive
for all
to authenticated
using (is_nova_challenge_manager())
with check (is_nova_challenge_manager());


create policy "Enable all access for challenge manager"
on "public"."nova_challenge_whitelisted_emails"
as permissive
for all
to authenticated
using (is_nova_challenge_manager())
with check (is_nova_challenge_manager());


create policy "Enable all access for challenge manager"
on "public"."nova_challenges"
as permissive
for all
to authenticated
using (is_nova_challenge_manager())
with check (is_nova_challenge_manager());


create policy " Enable all access for challenge manager"
on "public"."nova_problem_criteria_scores"
as permissive
for all
to authenticated
using (is_nova_challenge_manager())
with check (is_nova_challenge_manager());


create policy " Enable all access for challenge manager"
on "public"."nova_problem_test_cases"
as permissive
for all
to authenticated
using (is_nova_challenge_manager())
with check (is_nova_challenge_manager());


create policy " Enable all access for challenge manager"
on "public"."nova_problems"
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
using (((user_id = auth.uid()) OR is_nova_challenge_manager()))
with check (((user_id = auth.uid()) OR is_nova_challenge_manager()));


create policy " Enable all access for challenge manager"
on "public"."nova_submission_outputs"
as permissive
for all
to authenticated
using (is_nova_challenge_manager())
with check (is_nova_challenge_manager());


create policy "Enable all access for current user"
on "public"."nova_submissions"
as permissive
for all
to authenticated
using (((user_id = auth.uid()) OR is_nova_challenge_manager()))
with check (((user_id = auth.uid()) OR is_nova_challenge_manager()));


create policy "Allow all access for nova admins"
on "public"."nova_team_emails"
as permissive
for all
to authenticated
using (is_nova_challenge_manager())
with check (is_nova_challenge_manager());


create policy "Allow all access for nova admins"
on "public"."nova_team_members"
as permissive
for all
to authenticated
using (is_nova_challenge_manager())
with check (is_nova_challenge_manager());


create policy "Allow all access for nova admins"
on "public"."nova_teams"
as permissive
for all
to authenticated
using (is_nova_challenge_manager())
with check (is_nova_challenge_manager());



