drop policy "Enable read access for normal users" on "public"."nova_challenges";

drop policy "Enable read access for normal users" on "public"."nova_problems";

alter table "public"."nova_problem_testcases" drop constraint "nova_problem_testcases_problem_id_fkey";

alter table "public"."nova_problem_testcases" add constraint "nova_problem_testcases_problem_id_fkey" FOREIGN KEY (problem_id) REFERENCES nova_problems(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_problem_testcases" validate constraint "nova_problem_testcases_problem_id_fkey";

create policy "Allow current user to see their role"
on "public"."nova_roles"
as permissive
for select
to authenticated
using ((email = auth.email()));


create policy "Enable read access for normal users"
on "public"."nova_challenges"
as permissive
for select
to authenticated
using (((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.enabled = true)))) AND (enabled = true) AND (previewable_at IS NOT NULL) AND (now() > previewable_at)));


create policy "Enable read access for normal users"
on "public"."nova_problems"
as permissive
for select
to authenticated
using (((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.enabled = true)))) AND (EXISTS ( SELECT 1
   FROM nova_challenges nc
  WHERE ((nc.id = nova_problems.challenge_id) AND (nc.previewable_at > now()) AND (nc.open_at > now()) AND (nc.close_at <= now()))))));



