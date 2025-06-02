set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$SELECT EXISTS (
  SELECT 1
  FROM org_members om
  WHERE om.org_id = _org_id
  AND om.user_id = _user_id
);$function$
;

CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM projects
  WHERE id = _project_id
);
$function$
;
