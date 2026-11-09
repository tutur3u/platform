-- SR-924: private.* functions were executable by anon/authenticated through the PUBLIC default
-- (48 functions) plus two explicit authenticated grants, and authenticated held SELECT on
-- private.note_voice_jobs. Both are blocked today only because anon/authenticated lack
-- USAGE on schema private. Remove the grants so a future USAGE grant cannot expose them
-- (notably private.build_rate_limit_dblink_connstr(), which builds a connection string).
--
-- Kept on purpose (verified against prod pg_depend, 2026-11-09):
--   * can_join_form_realtime_topic / can_join_task_realtime_topic: used by RLS policies on
--     realtime.messages, so the invoking role needs EXECUTE.
--   * valid_subscription_months: CHECK constraint on finance_invoices.
--   * get_rate_limit_trust_decision: explicit grant to authenticator.
-- Trigger functions do not need EXECUTE at fire time. SECURITY DEFINER callers run as the owner.

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated, authenticator;

GRANT EXECUTE ON FUNCTION private.can_join_form_realtime_topic(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_join_task_realtime_topic(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.valid_subscription_months(date[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_rate_limit_trust_decision(uuid, inet, uuid) TO authenticator;

-- Future functions created by postgres in private must not default to client roles.
-- (The global postgres default ACL still grants authenticated; the pgTAP fence is the guard.)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, authenticator;

-- Only the service-role admin client reads note jobs (apps/web/src/lib/notes-voice/jobs.ts).
REVOKE ALL ON private.note_voice_jobs FROM PUBLIC, anon, authenticated;
