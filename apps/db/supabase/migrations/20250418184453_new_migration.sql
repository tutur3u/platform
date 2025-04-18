drop policy "Allow all access for nova admins" on "public"."nova_teams";

create policy "Allow all access for nova admins"
on "public"."nova_teams"
as permissive
for all
to authenticated
using ((is_nova_challenge_manager() OR (EXISTS ( SELECT 1
   FROM nova_team_members ntm,
    nova_team_emails e
  WHERE ((e.email = auth.email()) AND (ntm.team_id = nova_teams.id))))))
with check ((is_nova_challenge_manager() OR (EXISTS ( SELECT 1
   FROM nova_team_members ntm,
    nova_team_emails e
  WHERE ((e.email = auth.email()) AND (ntm.team_id = nova_teams.id))))));



