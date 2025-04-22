drop policy " Enable all access for challenge manager" on "public"."nova_submission_test_cases";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.is_nova_normal_competitor()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$begin 
  return exists (
    select 1 
    from public.nova_roles 
    where (select auth.email()) = email and enabled = true
  );
end;$function$
;

create policy "enable for normal user"
on "public"."nova_submission_criteria"
as permissive
for select
to authenticated
using (is_nova_normal_competitor());


create policy "enable all for challenge manager"
on "public"."nova_submission_test_cases"
as permissive
for all
to authenticated
using (is_nova_challenge_manager())
with check (is_nova_challenge_manager());


create policy "enable normal users"
on "public"."nova_submission_test_cases"
as permissive
for select
to authenticated
using (is_nova_normal_competitor());



