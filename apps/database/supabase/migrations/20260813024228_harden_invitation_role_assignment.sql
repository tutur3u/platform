-- A pending invite role becomes active when the invite is accepted, so callers
-- that can manage members but not roles must not be able to populate role_id by
-- writing the invite tables directly. The application route uses service-role
-- writes after checking both permissions; these policies protect direct
-- authenticated PostgREST writes as well.

-- Deleting a selected role cancels invitations that can no longer preserve the
-- inviter's access intent. This also keeps workspace deletion compatible with
-- the invitations' workspace-level cascades. Add without an initial scan; the
-- follow-up migration validates both constraints separately.
ALTER TABLE public.workspace_email_invites
DROP CONSTRAINT IF EXISTS workspace_email_invites_role_id_fkey,
ADD CONSTRAINT workspace_email_invites_role_id_fkey
FOREIGN KEY (role_id) REFERENCES public.workspace_roles(id) ON DELETE CASCADE
NOT VALID;

ALTER TABLE public.workspace_invites
DROP CONSTRAINT IF EXISTS workspace_invites_role_id_fkey,
ADD CONSTRAINT workspace_invites_role_id_fkey
FOREIGN KEY (role_id) REFERENCES public.workspace_roles(id) ON DELETE CASCADE
NOT VALID;

ALTER POLICY "Allow member managers to insert invites"
ON public.workspace_invites
WITH CHECK (
  public.has_workspace_permission(
    ws_id,
    (SELECT auth.uid()),
    'manage_workspace_members'::text
  )
  AND public.is_org_member((SELECT auth.uid()), ws_id)
  AND NOT public.is_org_member(user_id, ws_id)
  AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_secrets wss
    WHERE wss.ws_id = workspace_invites.ws_id
      AND wss.name = 'DISABLE_INVITE'::text
  )
  AND public.workspace_has_available_seats(ws_id)
  AND (
    role_id IS NULL
    OR (
      public.has_workspace_permission(
        ws_id,
        (SELECT auth.uid()),
        'manage_workspace_members'::text
      )
      AND public.has_workspace_permission(
        ws_id,
        (SELECT auth.uid()),
        'manage_workspace_roles'::text
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.workspace_roles wr
      WHERE wr.id = workspace_invites.role_id
        AND wr.ws_id = workspace_invites.ws_id
    )
  )
);

ALTER POLICY "Allow member managers to update invites"
ON public.workspace_invites
USING (
  public.has_workspace_permission(
    ws_id,
    (SELECT auth.uid()),
    'manage_workspace_members'::text
  )
  AND public.is_org_member((SELECT auth.uid()), ws_id)
)
WITH CHECK (
  public.has_workspace_permission(
    ws_id,
    (SELECT auth.uid()),
    'manage_workspace_members'::text
  )
  AND public.is_org_member((SELECT auth.uid()), ws_id)
  AND (
    role_id IS NULL
    OR public.has_workspace_permission(
      ws_id,
      (SELECT auth.uid()),
      'manage_workspace_roles'::text
    )
    AND EXISTS (
      SELECT 1
      FROM public.workspace_roles wr
      WHERE wr.id = workspace_invites.role_id
        AND wr.ws_id = workspace_invites.ws_id
    )
  )
);

ALTER POLICY "Allow member managers to send email invites"
ON public.workspace_email_invites
WITH CHECK (
  (
    public.is_member_invited((SELECT auth.uid()), ws_id)
    OR (
      public.is_org_member((SELECT auth.uid()), ws_id)
      AND public.has_workspace_permission(
        ws_id,
        (SELECT auth.uid()),
        'manage_workspace_members'::text
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.workspace_email_invites wei
      WHERE lower(wei.email) = lower((SELECT auth.email()))
    )
  )
  AND public.workspace_has_available_seats(ws_id)
  AND (
    role_id IS NULL
    OR (
      public.has_workspace_permission(
        ws_id,
        (SELECT auth.uid()),
        'manage_workspace_members'::text
      )
      AND public.has_workspace_permission(
        ws_id,
        (SELECT auth.uid()),
        'manage_workspace_roles'::text
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.workspace_roles wr
      WHERE wr.id = workspace_email_invites.role_id
        AND wr.ws_id = workspace_email_invites.ws_id
    )
  )
);

ALTER POLICY "Enable insert for workspace members"
ON public.workspace_email_invites
WITH CHECK (
  public.is_org_member((SELECT auth.uid()), ws_id)
  AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_secrets wss
    WHERE wss.ws_id = workspace_email_invites.ws_id
      AND wss.name = 'DISABLE_INVITE'::text
  )
  AND (
    role_id IS NULL
    OR (
      public.has_workspace_permission(
        ws_id,
        (SELECT auth.uid()),
        'manage_workspace_members'::text
      )
      AND public.has_workspace_permission(
        ws_id,
        (SELECT auth.uid()),
        'manage_workspace_roles'::text
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.workspace_roles wr
      WHERE wr.id = workspace_email_invites.role_id
        AND wr.ws_id = workspace_email_invites.ws_id
    )
  )
);

ALTER POLICY "Allow member managers to update email invites"
ON public.workspace_email_invites
USING (
  public.has_workspace_permission(
    ws_id,
    (SELECT auth.uid()),
    'manage_workspace_members'::text
  )
  AND public.is_org_member((SELECT auth.uid()), ws_id)
)
WITH CHECK (
  public.has_workspace_permission(
    ws_id,
    (SELECT auth.uid()),
    'manage_workspace_members'::text
  )
  AND public.is_org_member((SELECT auth.uid()), ws_id)
  AND (
    role_id IS NULL
    OR public.has_workspace_permission(
      ws_id,
      (SELECT auth.uid()),
      'manage_workspace_roles'::text
    )
    AND EXISTS (
      SELECT 1
      FROM public.workspace_roles wr
      WHERE wr.id = workspace_email_invites.role_id
        AND wr.ws_id = workspace_email_invites.ws_id
    )
  )
);
