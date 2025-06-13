drop policy "Enable delete for organization members" on "public"."workspace_members";
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.has_other_owner(_ws_id uuid, _user_id uuid) RETURNS boolean LANGUAGE plpgsql AS $function$ BEGIN RETURN EXISTS (
    SELECT 1
    FROM workspace_members
    WHERE ws_id = $1
      AND role = 'OWNER'::text
      AND user_id <> $2
  );
END;
$function$;
create policy "Enable delete for organization members" on "public"."workspace_members" as permissive for delete to authenticated using (
  (
    (
      is_org_member(auth.uid(), ws_id)
      AND (
        (auth.uid() = user_id)
        OR (
          (get_user_role(auth.uid(), ws_id) = 'ADMIN'::text)
          AND (role <> 'OWNER'::text)
        )
        OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text)
      )
      AND (role <> 'OWNER'::text)
    )
    OR has_other_owner(ws_id, user_id)
  )
);