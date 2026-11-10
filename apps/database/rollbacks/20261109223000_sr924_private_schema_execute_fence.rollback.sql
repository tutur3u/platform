-- Rollback for 20261109223000_sr924_private_schema_execute_fence.sql: restores the pre-SR-924 state
-- read from prod (q1, 2026-11-09): EXECUTE granted to PUBLIC on the 48 functions below, and SELECT on
-- private.note_voice_jobs for authenticated. The two realtime functions keep their authenticated grant.
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
TO PUBLIC;

GRANT SELECT ON private.note_voice_jobs TO authenticated;

-- The migration's schema-level ALTER DEFAULT PRIVILEGES ... REVOKE only removes entries that did not
-- exist before; there is nothing to restore for it.
