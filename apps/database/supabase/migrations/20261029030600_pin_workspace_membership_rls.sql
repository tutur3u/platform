-- SR-349: pin note updates to the creator's current workspace membership.
ALTER POLICY "Users can update their own notes" ON public.notes
  USING (creator_id = (SELECT auth.uid()))
  WITH CHECK (
    creator_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.ws_id = notes.ws_id
        AND wm.user_id = (SELECT auth.uid())
    )
  );

-- SR-350: request-scoped session writers must belong to the selected workspace.
ALTER POLICY "Users can manage their own sessions" ON public.live_api_sessions
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND public.is_org_member((SELECT auth.uid()), ws_id)
  );

-- SR-351: workspace visibility includes pending invitees; Aurora access requires membership.
ALTER POLICY "Allow all for workspace members" ON public.aurora_ml_forecast
  USING (public.is_org_member((SELECT auth.uid()), ws_id))
  WITH CHECK (public.is_org_member((SELECT auth.uid()), ws_id));

ALTER POLICY "Allow all for workspace members" ON public.aurora_ml_metrics
  USING (public.is_org_member((SELECT auth.uid()), ws_id))
  WITH CHECK (public.is_org_member((SELECT auth.uid()), ws_id));

ALTER POLICY "Allow all for workspace members" ON public.aurora_statistical_forecast
  USING (public.is_org_member((SELECT auth.uid()), ws_id))
  WITH CHECK (public.is_org_member((SELECT auth.uid()), ws_id));

ALTER POLICY "Allow all for workspace members" ON public.aurora_statistical_metrics
  USING (public.is_org_member((SELECT auth.uid()), ws_id))
  WITH CHECK (public.is_org_member((SELECT auth.uid()), ws_id));

ALTER POLICY "Allow role member to view" ON public.workspace_roles
  USING (public.is_org_member((SELECT auth.uid()), ws_id));

-- SR-352: OAuth callbacks write through request-scoped clients; pin token workspace ownership.
ALTER POLICY "Allow insert for workspace users" ON public.calendar_auth_tokens
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.is_org_member((SELECT auth.uid()), ws_id)
  );

ALTER POLICY "Allow update for workspace users and the participant" ON public.calendar_auth_tokens
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.is_org_member((SELECT auth.uid()), ws_id)
  );

-- F6: remove non-RLS privileges that allow table truncation or schema changes.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.calendar_auth_tokens
  FROM anon, authenticated;
