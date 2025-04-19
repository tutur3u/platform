alter table "public"."nova_teams" add column "description" text;

alter table "public"."nova_teams" add column "goals" text;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.is_nova_member_in_team(id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$begin
  return exists(
    select 1 
    from public.nova_team_members 
    where auth.email() = email 
    and team_id = id
  );
end;$function$
;

create policy "allow_user_to_update_team_info"
on "public"."nova_teams"
as permissive
for update
to authenticated
using (is_nova_member_in_team(id))
with check (is_nova_member_in_team(id));

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
