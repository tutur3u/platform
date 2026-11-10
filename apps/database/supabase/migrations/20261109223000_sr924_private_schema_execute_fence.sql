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

-- service_role reached these 48 functions only through the PUBLIC grant (their ACL is
-- `PUBLIC, postgres` with no service_role entry), so the REVOKE above removed it too.
-- Re-grant it statically to exactly those signatures; the 128 owner-only functions stay closed.
GRANT EXECUTE ON FUNCTION
  private.abuse_trust_multiplier_for_tier(abuse_risk_tier),
  private.allocate_inventory_checkout_revenue_trigger(),
  private.build_rate_limit_dblink_connstr(),
  private.clamp_abuse_score(integer),
  private.cleanup_rate_limits(interval),
  private.compute_abuse_risk_tier(integer,integer),
  private.disable_capacity_rule_for_removed_selector(),
  private.enforce_ai_report_review(),
  private.enforce_mail_domain_catch_all_target(),
  private.enforce_mailbox_domain(),
  private.enforce_task_capacity(),
  private.enforce_task_description_chunk_storage_limit(),
  private.enforce_task_relation_capacity(),
  private.ensure_course_module_quiz_submission_grade_state(),
  private.ensure_inventory_bundle_category_scope(),
  private.ensure_inventory_finance_mapping_scope(),
  private.ensure_inventory_product_revenue_share_scope(),
  private.ensure_workspace_quiz_type_grade_state(),
  private.external_chat_fence_binding_update(),
  private.external_chat_set_updated_at(),
  private.get_request_ip(jsonb),
  private.initialize_inventory_checkout_line_revenue(),
  private.inventory_bundle_category_components_json(uuid,uuid,uuid,text,timestamp with time zone,boolean),
  private.inventory_bundle_fixed_components_json(uuid,uuid),
  private.inventory_currency_minor_factor(text),
  private.inventory_major_to_minor(numeric,text),
  private.inventory_stock_available_quantity(uuid,uuid,uuid,timestamp with time zone),
  private.lock_task_capacity_board(),
  private.meet_stream_set_updated_at(),
  private.normalize_inventory_finance_entry(),
  private.parley_scenario_revision(),
  private.populate_inventory_listing_product_image(),
  private.populate_inventory_listing_variant_image(),
  private.prevent_active_catch_all_mailbox_disable(),
  private.raise_rate_limit_exceeded(integer),
  private.record_rate_limit_attempt(text,text,text,uuid,inet),
  private.reject_merged_inventory_identity(),
  private.reject_merged_inventory_reference(),
  private.safe_parse_inet(text),
  private.set_mail_updated_at(),
  private.sync_inventory_checkout_finance_link(),
  private.sync_inventory_product_image_to_listings(),
  private.sync_invoice_legacy_coverage_end(),
  private.task_capacity_rule_usage(uuid),
  private.task_matches_capacity_rule(uuid,uuid),
  private.task_matches_capacity_rule_state(uuid,uuid,uuid,uuid,timestamp with time zone,boolean,timestamp with time zone,timestamp with time zone),
  private.try_consume_rate_limit_bucket(text,interval,integer),
  private.valid_subscription_months(date[])
TO service_role;

-- Future functions created by postgres in private must not default to client roles.
-- (The global postgres default ACL still grants authenticated; the pgTAP fence is the guard.)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, authenticator;

-- Only the service-role admin client reads note jobs (apps/web/src/lib/notes-voice/jobs.ts).
REVOKE ALL ON private.note_voice_jobs FROM PUBLIC, anon, authenticated;
