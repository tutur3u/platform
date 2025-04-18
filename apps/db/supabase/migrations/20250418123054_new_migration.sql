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



