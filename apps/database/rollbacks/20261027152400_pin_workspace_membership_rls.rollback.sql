-- Rollback for 20261027152400_pin_workspace_membership_rls.sql.
-- Restores the exact pre-migration policy expressions. This migration revokes three direct privileges; rollback restores those exact privileges.
BEGIN;

ALTER POLICY "Users can update their own notes" ON public.notes
  USING (creator_id = (SELECT auth.uid()));

ALTER POLICY "Users can manage their own sessions" ON public.live_api_sessions
  USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "Allow all for workspace members" ON public.aurora_ml_forecast
  USING (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = aurora_ml_forecast.ws_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = aurora_ml_forecast.ws_id));

ALTER POLICY "Allow all for workspace members" ON public.aurora_ml_metrics
  USING (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = aurora_ml_metrics.ws_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = aurora_ml_metrics.ws_id));

ALTER POLICY "Allow all for workspace members" ON public.aurora_statistical_forecast
  USING (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = aurora_statistical_forecast.ws_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = aurora_statistical_forecast.ws_id));

ALTER POLICY "Allow all for workspace members" ON public.aurora_statistical_metrics
  USING (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = aurora_statistical_metrics.ws_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = aurora_statistical_metrics.ws_id));

ALTER POLICY "Allow role member to view" ON public.workspace_roles
  USING (EXISTS (SELECT 1 FROM public.workspaces wss WHERE wss.id = workspace_roles.ws_id));

ALTER POLICY "Allow insert for workspace users" ON public.calendar_auth_tokens
  WITH CHECK (user_id = (SELECT auth.uid()));

ALTER POLICY "Allow update for workspace users and the participant" ON public.calendar_auth_tokens
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Restores only the exact direct grants this migration revokes; no PUBLIC grant.
-- allow-anon-grant: exact rollback of pre-migration privileges for anon and authenticated.
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.calendar_auth_tokens
  TO anon, authenticated;

COMMIT;
