alter table "public"."nova_teams" add column "description" text;

alter table "public"."nova_teams" add column "goals" text;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.is_nova_user_id_in_team(_user_id uuid, _team_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
begin
  return exists(
    select 1 
    from public.nova_team_members 
    where _user_id = user_id 
    and _team_id = team_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_nova_user_email_in_team(_user_email text, _team_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
begin
  return exists(
    select 1 
    from public.nova_team_members 
    where _user_email = email 
    and _team_id = team_id
  );
end;
$function$
;

create policy "allow_user_to_update_team_info"
on "public"."nova_teams"
as permissive
for update
to authenticated
using (is_nova_user_id_in_team(auth.uid(), id) or is_nova_user_email_in_team(auth.email(), id) or is_nova_user_email_in_team(auth.email(), id))
with check (is_nova_user_id_in_team(auth.uid(), id) or is_nova_user_email_in_team(auth.email(), id) or is_nova_user_email_in_team(auth.email(), id));

drop policy "Allow all access for nova admins" on "public"."nova_teams";

create policy "Allow all access for nova admins"
on "public"."nova_teams"
as permissive
for all
to authenticated
using ((is_nova_challenge_manager() OR is_nova_user_id_in_team(auth.uid(), id) OR is_nova_user_email_in_team(auth.email(), id)))
with check ((is_nova_challenge_manager() OR is_nova_user_id_in_team(auth.uid(), id) OR is_nova_user_email_in_team(auth.email(), id)));
