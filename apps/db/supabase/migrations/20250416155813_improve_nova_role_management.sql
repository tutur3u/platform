drop policy "Enable all access for role manager" on "public"."nova_roles";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.is_nova_challenge_manager()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  return exists (
    select 1 from public.nova_roles
    where (select auth.email()) = email and allow_challenge_management = true
  );
end;
$function$
;

create policy "Enable all access for role manager"
on "public"."nova_roles"
as permissive
for all
to authenticated
using (is_nova_challenge_manager());



