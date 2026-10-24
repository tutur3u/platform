-- Participant views are read by plan-scoped server/admin callers only.
REVOKE ALL ON TABLE public.meet_together_users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.meet_together_users TO service_role;
