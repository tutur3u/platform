drop policy "Enable insert for organization members" on "public"."workspace_invites";
drop policy "Enable insert for invited members or workspace members" on "public"."workspace_members";
create policy "Enable insert for workspace members" on "public"."workspace_invites" as permissive for
insert to authenticated with check (
    (
      is_org_member(auth.uid(), ws_id)
      AND (NOT is_org_member(user_id, ws_id))
      AND (
        NOT (
          EXISTS (
            SELECT 1
            FROM workspace_secrets wss
            WHERE (
                (wss.ws_id = workspace_invites.ws_id)
                AND (wss.name = 'DISABLE_INVITE'::text)
              )
          )
        )
      )
    )
  );
create policy "Enable insert for invited members or workspace admins" on "public"."workspace_members" as permissive for
insert to authenticated with check (
    (
      is_member_invited(auth.uid(), ws_id)
      OR (
        is_org_member(auth.uid(), ws_id)
        AND (
          (get_user_role(auth.uid(), ws_id) = 'ADMIN'::text)
          OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text)
        )
      )
    )
  );
DROP FUNCTION IF EXISTS public.delete_invite_when_accepted() CASCADE;
CREATE OR REPLACE FUNCTION public.sync_member_roles_from_invite() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$ begin -- Copy role and role_title from invite to new member
  new.role := coalesce(
    (
      SELECT i.role
      FROM public.workspace_invites i
      WHERE i.ws_id = new.ws_id
        AND i.user_id = new.user_id
    ),
    new.role,
    'MEMBER'::text
  );
new.role_title := coalesce(
  (
    SELECT i.role_title
    FROM public.workspace_invites i
    WHERE i.ws_id = new.ws_id
      AND i.user_id = new.user_id
  ),
  new.role_title,
  ''::text
);
return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.delete_invite_when_accepted() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$ begin -- Delete the invite
delete FROM public.workspace_invites i
WHERE i.ws_id = new.ws_id
  AND i.user_id = new.user_id;
return new;
end;
$function$;
CREATE TRIGGER sync_member_roles_from_invite_tr BEFORE
INSERT ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION sync_member_roles_from_invite();
CREATE TRIGGER delete_invite_when_accepted_tr
AFTER
INSERT ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION delete_invite_when_accepted();