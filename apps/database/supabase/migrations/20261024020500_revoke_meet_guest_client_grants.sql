-- Meet plan guests (including their password verifiers) are read and written
-- only by server code using the service role. Row level security is enabled
-- with no anon/authenticated policies, so the original client-role grants are
-- unused; revoke them so the table stays closed even if a policy is added.
revoke all on table public.meet_together_guests from anon, authenticated;
