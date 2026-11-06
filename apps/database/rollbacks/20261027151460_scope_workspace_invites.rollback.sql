-- Manual rollback only: restores the workspace invitation INSERT policies as
-- they were before 20261027151460 and removes the invite helpers.
-- This reintroduces the cross-workspace invite acceptance (SR-366).
BEGIN;

DROP POLICY IF EXISTS "Allow workspace managers to insert members with constraints"
  ON public.workspace_members;

CREATE POLICY "Allow workspace managers to insert members with constraints"
ON public.workspace_members
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  (user_id = (SELECT auth.uid() AS uid))
  AND (
    (
      ((public.is_personal_workspace(ws_id) = false) OR public.is_workspace_owner(ws_id, (SELECT auth.uid() AS uid)))
      AND (
        public.is_member_invited((SELECT auth.uid() AS uid), ws_id)
        OR (EXISTS (
          SELECT 1
          FROM public.workspace_email_invites wei
          WHERE (lower(wei.email) = lower((SELECT auth.email() AS email)))
        ))
      )
    )
    OR (EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE (
        (w.id = workspace_members.ws_id)
        AND (w.creator_id = (SELECT auth.uid() AS uid))
        AND (NOT (EXISTS (
          SELECT 1
          FROM public.workspace_members wm
          WHERE (wm.ws_id = workspace_members.ws_id)
        )))
      )
    ))
  )
);

DROP POLICY IF EXISTS "Allow member managers to send email invites"
  ON public.workspace_email_invites;

CREATE POLICY "Allow member managers to send email invites"
ON public.workspace_email_invites
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  (
    public.is_member_invited((SELECT auth.uid() AS uid), ws_id)
    OR (
      public.is_org_member((SELECT auth.uid() AS uid), ws_id)
      AND public.has_workspace_permission(ws_id, (SELECT auth.uid() AS uid), 'manage_workspace_members'::text)
    )
    OR (EXISTS (
      SELECT 1
      FROM public.workspace_email_invites wei
      WHERE (lower(wei.email) = lower((SELECT auth.email() AS email)))
    ))
  )
  AND public.workspace_has_available_seats(ws_id)
  AND (
    (role_id IS NULL)
    OR (
      (type = 'MEMBER'::public.workspace_member_type)
      AND public.has_workspace_permission(ws_id, (SELECT auth.uid() AS uid), 'manage_workspace_members'::text)
      AND public.has_workspace_permission(ws_id, (SELECT auth.uid() AS uid), 'manage_workspace_roles'::text)
      AND (EXISTS (
        SELECT 1
        FROM public.workspace_roles wr
        WHERE ((wr.id = workspace_email_invites.role_id) AND (wr.ws_id = workspace_email_invites.ws_id))
      ))
    )
  )
);

DROP POLICY IF EXISTS "Enable insert for workspace members"
  ON public.workspace_email_invites;

CREATE POLICY "Enable insert for workspace members"
ON public.workspace_email_invites
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_org_member((SELECT auth.uid() AS uid), ws_id)
  AND (NOT (EXISTS (
    SELECT 1
    FROM public.workspace_secrets wss
    WHERE ((wss.ws_id = workspace_email_invites.ws_id) AND (wss.name = 'DISABLE_INVITE'::text))
  )))
  AND (
    (role_id IS NULL)
    OR (
      (type = 'MEMBER'::public.workspace_member_type)
      AND public.has_workspace_permission(ws_id, (SELECT auth.uid() AS uid), 'manage_workspace_members'::text)
      AND public.has_workspace_permission(ws_id, (SELECT auth.uid() AS uid), 'manage_workspace_roles'::text)
      AND (EXISTS (
        SELECT 1
        FROM public.workspace_roles wr
        WHERE ((wr.id = workspace_email_invites.role_id) AND (wr.ws_id = workspace_email_invites.ws_id))
      ))
    )
  )
);

DROP FUNCTION IF EXISTS public.current_user_workspace_invite_type(uuid);
DROP FUNCTION IF EXISTS public.current_user_can_bootstrap_workspace(uuid);
DROP FUNCTION IF EXISTS public.current_user_can_assign_workspace_role(uuid, uuid);

NOTIFY pgrst, 'reload schema';

COMMIT;
