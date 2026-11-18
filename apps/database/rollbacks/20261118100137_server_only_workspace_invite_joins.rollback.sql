-- Manual rollback only: restores the client invite branch of the
-- workspace_members INSERT policy and signed-in EXECUTE on the invite type
-- helper, exactly as 20261027151460_scope_workspace_invites defined them.
BEGIN;

DROP POLICY IF EXISTS "Allow workspace managers to insert members with constraints"
  ON public.workspace_members;

CREATE POLICY "Allow workspace managers to insert members with constraints"
ON public.workspace_members
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND (
    (
      (
        public.is_personal_workspace(ws_id) = false
        OR public.is_workspace_owner(ws_id, (SELECT auth.uid()))
      )
      AND type = public.current_user_workspace_invite_type(ws_id)
    )
    OR public.current_user_can_bootstrap_workspace(ws_id)
  )
);

-- tuturuuu: reviewed(function-grant): public.current_user_workspace_invite_type(uuid) review=N140-INVITE-PKCE
GRANT EXECUTE ON FUNCTION public.current_user_workspace_invite_type(uuid)
  TO authenticated, service_role;

COMMIT;
