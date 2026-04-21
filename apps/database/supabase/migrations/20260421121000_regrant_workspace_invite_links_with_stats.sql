-- If 20260421120000 ran before grants were added to that file, restore SELECT on the stats view.
-- Safe to apply multiple times.
GRANT SELECT ON public.workspace_invite_links_with_stats TO authenticated;
GRANT SELECT ON public.workspace_invite_links_with_stats TO service_role;
