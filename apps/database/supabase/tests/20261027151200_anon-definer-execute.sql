BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

CREATE TEMP TABLE anon_definer_allowlist (signature text PRIMARY KEY);
INSERT INTO anon_definer_allowlist VALUES
  ('public.is_org_member(uuid,uuid)'),
  ('public.has_workspace_permission(uuid,uuid,text)'),
  ('public.check_request()'),
  ('public.validate_cross_app_token_with_session(text,text)'),
  ('public.validate_cross_app_token(text,text)'),
  ('public.get_workspace_storage_limit(uuid)');

CREATE FUNCTION pg_temp.anon_definer_violations() RETURNS text[]
LANGUAGE plpgsql AS $$
DECLARE fn record; failures text[] := '{}';
BEGIN
  FOR fn IN
    SELECT p.oid, p.proacl, p.proowner FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM anon_definer_allowlist a
        WHERE to_regprocedure(a.signature)::oid = p.oid)
  LOOP
    IF has_function_privilege('anon', fn.oid, 'EXECUTE') OR EXISTS (
      SELECT 1 FROM aclexplode(coalesce(fn.proacl, acldefault('f', fn.proowner))) a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) THEN
      failures := array_append(failures, fn.oid::regprocedure::text);
    END IF;
  END LOOP;
  RETURN failures;
END;
$$;

-- These assertions run before reapplication so the same test is RED on main.
SELECT is(cardinality(pg_temp.anon_definer_violations()), 0,
  'catalog loop: no non-allowlisted definer allows anon or PUBLIC');
SELECT ok(to_regprocedure(signature) IS NOT NULL
  AND has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE'),
  'anon retains allowlisted ' || signature)
FROM anon_definer_allowlist ORDER BY signature;

SELECT ok(count(*) > 0 AND bool_and(
  NOT has_function_privilege('anon', p.oid, 'EXECUTE')
  AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
  AND has_function_privilege('service_role', p.oid, 'EXECUTE')),
  p.proname || ': all overloads are service_role-only')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('record_email_bounce', 'record_email_complaint')
GROUP BY p.proname ORDER BY p.proname;
SELECT is((SELECT count(DISTINCT p.proname)::integer
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('record_email_bounce', 'record_email_complaint')), 2,
  'both provider-ingestion functions exist');

SET LOCAL ROLE anon;
SELECT throws_ok('SELECT public.get_workspace_overview()', '42501',
  'permission denied for function get_workspace_overview', 'anon cannot call workspace overview');
SELECT throws_ok('SELECT public.get_recent_audit_logs(1)', '42501',
  'permission denied for function get_recent_audit_logs', 'anon cannot call audit logs');
SELECT lives_ok('SELECT * FROM public.guest_users_lead_generation LIMIT 1',
  'anon SELECT on an existing RLS-helper table still prepares and runs');
SELECT lives_ok($$SELECT public.validate_cross_app_token_with_session('sb19-invalid-token', 'web')$$,
  'anonymous token validation still returns a normal invalid-token result');
SELECT set_config('request.method', 'GET', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT lives_ok('SELECT public.check_account_request()',
  'signed-out PostgREST pre-request hook still runs');
RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);

CREATE FUNCTION public.sb19_default_probe() RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$SELECT 1$$;
SELECT ok(NOT has_function_privilege('anon', 'public.sb19_default_probe()', 'EXECUTE'),
  'new functions do not default to anon EXECUTE');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_proc p,
  LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  WHERE p.oid = 'public.sb19_default_probe()'::regprocedure AND a.grantee = 0
    AND a.privilege_type = 'EXECUTE'), 'new functions do not default to PUBLIC EXECUTE');
SELECT ok(has_function_privilege('authenticated', 'public.sb19_default_probe()', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.sb19_default_probe()', 'EXECUTE'),
  'new functions preserve signed-in and service defaults previously supplied by PUBLIC');

-- Effective privileges captured from the full disposable main migration chain
-- at cbf4a7c49d9bf4910aaed58cc7607048274298a4 before applying this migration.
-- Approved provider ingestion and B/C service-role restrictions are explicit below.
-- C removes the two broken notification overloads; their absence is asserted.
CREATE TEMP TABLE definer_execute_expected (
  signature text PRIMARY KEY, authenticated boolean, service_role boolean
);
INSERT INTO definer_execute_expected VALUES
  ('public._consume_payg_credits(uuid,numeric)', false, true),
  ('public._get_active_payg_credits(uuid)', false, true),
  ('public._inventory_create_reserved_line(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,timestamp with time zone,uuid)', false, true),
  ('public._inventory_reserve_bundle_components(uuid,uuid,uuid,uuid,uuid,jsonb,bigint,bigint,text,timestamp with time zone,timestamp with time zone)', false, true),
  ('public._inventory_reserved_quantity(uuid,uuid,uuid,timestamp with time zone)', true, true),
  ('public._release_expired_ai_credit_reservations(uuid)', false, true),
  ('public._release_expired_embedding_credit_reservations(uuid)', false, true),
  ('public._resolve_table_associated_ws_id(text,jsonb)', false, true),
  ('public._resolve_user_personal_workspace_id(uuid)', false, true),
  ('public._resolve_workspace_tier(uuid)', true, true),
  ('public._validate_platform_entity_limit_target(text)', false, true),
  ('public.abandon_profile_banner_operation(uuid,uuid,text)', false, true),
  ('public.account_mfa_verified_factor(uuid,text,bigint,bigint)', false, true),
  ('public.account_required_mfa_satisfied()', true, true),
  ('public.add_platform_entity_creation_limit_table(text,text,uuid)', false, true),
  ('public.add_ws_creator()', true, true),
  ('public.admin_create_workspace_user_with_audit_actor(uuid,jsonb,uuid)', false, true),
  ('public.admin_delete_finance_invoice(uuid,uuid,uuid)', false, true),
  ('public.admin_delete_workspace_user_with_audit_actor(uuid,uuid,uuid)', false, true),
  ('public.admin_get_ai_credit_entity_detail(uuid,uuid)', false, true),
  ('public.admin_get_finance_invoice_history(uuid,uuid,uuid,boolean,integer,integer,text,text,text,timestamp with time zone,timestamp with time zone,text)', false, true),
  ('public.admin_list_ai_credit_transactions(integer,integer,uuid,uuid,text,text,text,text,timestamp with time zone,timestamp with time zone)', false, true),
  ('public.admin_list_rate_limit_counters(integer,text)', false, true),
  ('public.admin_reset_rate_limits()', false, true),
  ('public.admin_restore_finance_invoice(uuid,uuid,uuid)', false, true),
  ('public.admin_update_finance_invoice(uuid,uuid,uuid,jsonb)', false, true),
  ('public.admin_update_workspace_user_with_audit_actor(uuid,uuid,jsonb,uuid)', false, true),
  ('public.apply_calendar_google_import(uuid,jsonb,jsonb)', false, true),
  ('public.apply_hive_world_event(uuid,uuid,bigint,text,jsonb,jsonb)', false, true),
  ('public.archive_old_notifications(integer)', false, true),
  ('public.assign_default_workspace_user_group()', true, true),
  ('public.atomic_sync_token_operation(uuid,text,text,text)', false, true),
  ('public.authorize_workspace_user_audit_access(uuid)', false, true),
  ('public.auto_add_assignee_as_watcher()', true, true),
  ('public.auto_create_personal_workspace()', true, true),
  ('public.award_mira_xp(uuid,integer,text)', true, true),
  ('public.award_tulearn_xp(uuid,uuid,text,text,integer,text,jsonb)', true, true),
  ('public.backfill_workspace_user_status_changes(uuid,boolean,integer)', false, true),
  ('public.calculate_personal_task_placement_sort_key(uuid,uuid,uuid,uuid,uuid,double precision)', false, true),
  ('public.calendar_google_color_operation(text,uuid,uuid,uuid,jsonb)', false, true),
  ('public.calendar_google_mutation_operation(text,uuid,uuid,uuid,jsonb)', false, true),
  ('public.calendar_native_generation_mutation(text,uuid,uuid,uuid,jsonb)', false, true),
  ('public.calendar_provider_saga_operation(text,uuid,uuid,uuid,jsonb)', false, true),
  ('public.calendar_provider_series_is_readonly(uuid,uuid,uuid,uuid)', false, true),
  ('public.calendar_provider_series_operation(uuid,uuid,text,jsonb)', false, true),
  ('public.calendar_provider_series_reconcile(uuid,uuid,uuid,text,jsonb)', false, true),
  ('public.calendar_retained_generation(uuid,uuid,uuid)', false, true),
  ('public.calendar_series_operation(uuid,text,jsonb,uuid)', true, true),
  ('public.can_access_task_plan(uuid,text,uuid)', true, true),
  ('public.can_create_workspace(uuid)', true, true),
  ('public.can_manage_indicator(uuid)', true, true),
  ('public.can_manage_workspace_external_projects(uuid,uuid)', true, true),
  ('public.can_publish_workspace_external_projects(uuid,uuid)', true, true),
  ('public.capture_calendar_google_import(uuid,text,uuid)', false, true),
  ('public.cascade_label_delete_from_drafts()', true, true),
  ('public.cascade_project_delete_from_drafts()', true, true),
  ('public.cascade_user_delete_from_draft_assignees()', true, true),
  ('public.check_ai_credit_allowance(uuid,text,text,integer,uuid)', false, true),
  ('public.check_challenge_attempt_limits()', false, true),
  ('public.check_email_blocked(text)', true, true),
  ('public.check_email_bounce_status(text,integer)', true, true),
  ('public.check_product_feedback_staff_eligibility(uuid)', false, true),
  ('public.check_request()', true, true),
  ('public.check_time_tracking_session_insert()', true, true),
  ('public.check_time_tracking_session_update()', true, true),
  ('public.claim_profile_banner_upload(uuid,uuid,text,text)', false, true),
  ('public.cleanup_expired_cross_app_tokens()', false, true),
  ('public.cleanup_expired_live_sessions()', false, true),
  ('public.cleanup_expired_notifications()', false, true),
  ('public.cleanup_old_api_key_usage_logs()', false, true),
  ('public.cleanup_old_typing_indicators()', false, true),
  ('public.cleanup_platform_email_roles()', true, true),
  ('public.cleanup_qr_login_challenges()', true, true),
  ('public.cleanup_role_inconsistencies()', false, true),
  ('public.clear_task_projects_lead_on_member_delete()', true, true),
  ('public.commit_fixed_ai_credit_reservation(uuid,jsonb)', false, true),
  ('public.commit_metered_embedding_credits(uuid,jsonb)', false, true),
  ('public.commit_profile_banner_operation(uuid,uuid,text,boolean)', false, true),
  ('public.complete_inventory_checkout_session(uuid,uuid,timestamp with time zone)', false, true),
  ('public.complete_inventory_checkout_session_payment(uuid,uuid,text,timestamp with time zone)', false, true),
  ('public.complete_inventory_checkout_session_square_payment(uuid,uuid,text,text,timestamp with time zone)', false, true),
  ('public.complete_mira_focus_session(uuid,text)', true, true),
  ('public.complete_profile_banner_retirement(uuid,text,boolean)', false, true),
  ('public.consolidate_workspace_user_links(uuid)', false, true),
  ('public.count_user_workspaces(uuid)', true, true),
  ('public.create_ai_chat(text,text,text)', true, true),
  ('public.create_course_test_with_modules(uuid,text,uuid[],timestamp with time zone,integer,text)', false, true),
  ('public.create_inventory_checkout_session(text,jsonb,timestamp with time zone)', false, true),
  ('public.create_missing_personal_workspaces()', false, true),
  ('public.create_notification(uuid,uuid,text,text,text,text,text,jsonb,text,uuid,uuid,notification_scope,notification_priority)', false, true),
  ('public.create_parley_session(uuid,uuid,uuid)', false, true),
  ('public.create_personal_workspace_for_new_user()', true, true),
  ('public.create_scheduled_workspace_meeting(uuid,uuid,uuid,text,timestamp with time zone,timestamp with time zone,text,text,text,boolean,text)', false, true),
  ('public.create_system_announcement(text,text,notification_priority,text,timestamp with time zone,jsonb)', false, true),
  ('public.create_user_notification(uuid,text,text,text,notification_priority,text,jsonb)', false, true),
  ('public.create_user_profile()', true, true),
  ('public.create_workspace_system_calendars()', true, true),
  ('public.create_workspace_user_linked_user()', false, false),
  ('public.current_user_shares_workspace_with(uuid)', true, true),
  ('public.deduct_ai_credits(uuid,text,integer,integer,integer,text,uuid,uuid,jsonb)', false, true),
  ('public.deduct_ai_credits(uuid,text,integer,integer,integer,text,uuid,uuid,jsonb,uuid,integer,integer)', false, true),
  ('public.deduct_fixed_ai_credits(uuid,uuid,numeric,text,text,jsonb)', false, true),
  ('public.delete_drafts_on_member_removal()', true, true),
  ('public.delete_invite_when_accepted()', true, true),
  ('public.detect_duplicate_workspace_users(uuid)', true, true),
  ('public.disconnect_sepay_integration(uuid,timestamp with time zone)', false, true),
  ('public.enforce_personal_workspace_member_limit()', true, true),
  ('public.enforce_personal_workspace_single_member()', true, true),
  ('public.enforce_platform_entity_creation_limits()', false, true),
  ('public.enforce_public_user_profile_policy()', false, false),
  ('public.enforce_single_parent_constraint()', true, true),
  ('public.enforce_time_tracking_session_task_workspace()', false, false),
  ('public.enforce_unique_personal_workspace()', true, true),
  ('public.enforce_whiteboard_create_rate_limit()', true, true),
  ('public.enforce_workspace_course_module_group_parent_match()', true, true),
  ('public.enforce_workspace_dataset_cell_parent()', false, false),
  ('public.enforce_workspace_member_type_update()', true, true),
  ('public.ensure_sepay_fallback_transaction_category(uuid,text,boolean)', false, true),
  ('public.ensure_workspace_creator_membership()', false, false),
  ('public.ensure_workspace_user_link(uuid,uuid)', true, true),
  ('public.expire_profile_banner_operations(uuid,text)', false, true),
  ('public.fetch_workspace_invoice_configs(uuid)', true, true),
  ('public.generate_cross_app_token(uuid,text,text,integer)', true, true),
  ('public.generate_cross_app_token(uuid,text,text,integer,jsonb)', true, true),
  ('public.get_action_frequency_by_hour()', true, true),
  ('public.get_active_ip_block(text)', false, true),
  ('public.get_active_sessions_count()', true, true),
  ('public.get_activity_heatmap()', true, true),
  ('public.get_ai_credit_usage_summary(uuid,timestamp with time zone)', false, true),
  ('public.get_ai_credit_usage_summary(uuid,timestamp with time zone,uuid)', false, true),
  ('public.get_ai_execution_daily_stats_v2(uuid,timestamp with time zone,timestamp with time zone,jsonb)', false, true),
  ('public.get_ai_execution_model_stats_v2(uuid,timestamp with time zone,timestamp with time zone,jsonb)', false, true),
  ('public.get_ai_execution_monthly_cost(uuid,integer,integer,jsonb,numeric)', false, true),
  ('public.get_ai_execution_monthly_cost_v2(uuid,integer,integer,jsonb,numeric)', false, true),
  ('public.get_ai_execution_summary(uuid,timestamp with time zone,timestamp with time zone,jsonb,numeric)', false, true),
  ('public.get_ai_execution_summary_v2(uuid,timestamp with time zone,timestamp with time zone,jsonb,numeric)', false, true),
  ('public.get_auth_provider_stats()', true, true),
  ('public.get_auth_session_statistics()', true, true),
  ('public.get_available_platform_entity_limit_tables()', false, true),
  ('public.get_balance_trend(uuid,timestamp with time zone,timestamp with time zone,boolean,integer)', true, false),
  ('public.get_blocked_tasks(uuid)', false, true),
  ('public.get_blocking_tasks(uuid)', false, true),
  ('public.get_bounce_complaint_stats(timestamp with time zone)', false, true),
  ('public.get_category_breakdown(uuid,timestamp with time zone,timestamp with time zone,boolean,text,text)', true, true),
  ('public.get_category_breakdown(uuid,timestamp with time zone,timestamp with time zone,boolean,text,text,boolean)', true, true),
  ('public.get_category_breakdown(uuid,timestamp with time zone,timestamp with time zone,boolean,text,text,boolean,text,uuid[])', true, true),
  ('public.get_challenge_stats(uuid,uuid)', false, true),
  ('public.get_current_user_email()', true, true),
  ('public.get_daily_activity_heatmap(uuid,uuid,integer)', true, true),
  ('public.get_daily_income_expense(uuid,integer,boolean)', false, true),
  ('public.get_daily_income_expense_range(uuid,timestamp with time zone,timestamp with time zone,boolean)', true, true),
  ('public.get_daily_invoice_totals(uuid,integer,uuid[],uuid[],date,date)', true, true),
  ('public.get_dau_count()', true, true),
  ('public.get_default_calendar_for_event(uuid,calendar_scheduling_source)', false, true),
  ('public.get_email_audit_stats(uuid,timestamp with time zone)', false, true),
  ('public.get_email_audit_stats_global(timestamp with time zone)', false, true),
  ('public.get_email_block_statuses(text[])', true, true),
  ('public.get_email_stats(uuid,timestamp with time zone,timestamp with time zone)', false, true),
  ('public.get_engagement_metrics_over_time(integer)', true, true),
  ('public.get_external_project_storage_analytics(uuid,text)', false, true),
  ('public.get_feature_adoption(text)', true, true),
  ('public.get_finance_invoice_products_by_workspace(uuid,integer,integer)', false, true),
  ('public.get_finance_invoice_promotions_by_workspace(uuid,integer,integer)', false, true),
  ('public.get_finance_invoice_user_groups_by_workspace(uuid,integer,integer)', false, true),
  ('public.get_group_report_status_summary(uuid)', false, true),
  ('public.get_grouped_sessions_paginated(uuid,text,integer,integer,text,date,date,text)', true, true),
  ('public.get_income_expense_chart_summary(uuid,timestamp with time zone,timestamp with time zone,boolean,text)', true, false),
  ('public.get_invoice_creators(uuid)', false, true),
  ('public.get_invoice_totals_by_date_range(uuid,timestamp with time zone,timestamp with time zone,uuid[],uuid[],boolean,integer,text)', true, true),
  ('public.get_ip_block_level(text)', false, true),
  ('public.get_mau_count()', true, true),
  ('public.get_monthly_category_breakdown(uuid,timestamp with time zone,timestamp with time zone,boolean)', true, true),
  ('public.get_monthly_category_breakdown(uuid,timestamp with time zone,timestamp with time zone,boolean,text)', true, true),
  ('public.get_monthly_income_expense(uuid,integer,boolean)', false, true),
  ('public.get_monthly_income_expense_range(uuid,timestamp with time zone,timestamp with time zone,boolean)', true, true),
  ('public.get_monthly_invoice_totals(uuid,integer,uuid[],uuid[],date,date)', true, true),
  ('public.get_notification_email_config(text)', false, true),
  ('public.get_or_create_credit_balance(uuid)', false, true),
  ('public.get_or_create_credit_balance(uuid,uuid)', false, true),
  ('public.get_or_create_external_calendar(uuid,text,text,text,calendar_provider)', true, true),
  ('public.get_or_create_mira_pet(uuid)', false, true),
  ('public.get_or_create_notification_batch(uuid,uuid,text,integer,text,notification_delivery_mode)', false, true),
  ('public.get_pending_invoices(uuid,integer,integer,text,uuid[])', false, true),
  ('public.get_pending_invoices_base(uuid,boolean)', false, true),
  ('public.get_pending_invoices_base_guarded(uuid,boolean)', false, false),
  ('public.get_pending_invoices_count(uuid,text,uuid[])', false, true),
  ('public.get_pending_invoices_grouped_by_user(uuid,integer,integer,text,uuid[])', false, true),
  ('public.get_pending_invoices_grouped_by_user_count(uuid,text,uuid[])', false, true),
  ('public.get_period_summary_stats(uuid,text)', true, true),
  ('public.get_personal_task_board_external_counts(uuid,boolean,boolean)', true, true),
  ('public.get_platform_ai_credit_overview()', false, true),
  ('public.get_power_users(integer)', false, true),
  ('public.get_product_feedback_media_staff(uuid,uuid)', false, true),
  ('public.get_product_feedback_receipt(uuid)', true, false),
  ('public.get_product_feedback_staff(uuid,uuid)', false, true),
  ('public.get_rate_limit_trust_decision(uuid,text,uuid)', false, true),
  ('public.get_recent_actions_summary(integer)', true, true),
  ('public.get_recent_audit_logs(integer)', false, true),
  ('public.get_related_tasks(uuid)', false, true),
  ('public.get_retention_rate(text)', true, true),
  ('public.get_security_budget_entitlement(uuid,uuid)', false, true),
  ('public.get_sessions_by_device()', true, true),
  ('public.get_sign_ins_by_provider(integer)', true, true),
  ('public.get_spending_trends(uuid,integer,text)', true, false),
  ('public.get_task_board_workspace_id(uuid)', false, true),
  ('public.get_task_board_workspace_members(uuid)', false, true),
  ('public.get_task_capacity_rules(uuid)', false, true),
  ('public.get_task_children(uuid)', false, true),
  ('public.get_task_details(uuid)', false, true),
  ('public.get_task_history(uuid,uuid,integer,integer,text,text)', true, true),
  ('public.get_task_history_for_actor(uuid,uuid,uuid,integer,integer,text,text)', false, true),
  ('public.get_task_parents(uuid)', false, true),
  ('public.get_task_relationships_at_snapshot(uuid,uuid,uuid)', true, true),
  ('public.get_task_relationships_at_snapshot_for_actor(uuid,uuid,uuid,uuid)', false, true),
  ('public.get_task_share_permission_from_link(text)', false, true),
  ('public.get_task_snapshot_at_history(uuid,uuid,uuid)', true, true),
  ('public.get_task_snapshot_at_history_for_actor(uuid,uuid,uuid,uuid)', false, true),
  ('public.get_task_workspace_id(uuid)', false, true),
  ('public.get_time_tracking_daily_activity(uuid,integer,uuid)', true, true),
  ('public.get_time_tracking_sessions_paginated(uuid,text,integer,integer,text)', true, true),
  ('public.get_time_tracking_stats(uuid,uuid)', true, true),
  ('public.get_transaction_count_by_tag(uuid)', true, false),
  ('public.get_transaction_creators(uuid)', false, true),
  ('public.get_transaction_list_enrichment(uuid,uuid[],uuid)', true, true),
  ('public.get_transaction_stats(uuid,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamp with time zone,timestamp with time zone)', true, true),
  ('public.get_transactions_by_period(uuid,text,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,integer,text)', true, true),
  ('public.get_user_accessible_tasks(uuid,uuid,boolean,task_board_status[],boolean,boolean)', true, true),
  ('public.get_user_activity_cohorts()', true, true),
  ('public.get_user_growth_comparison()', true, true),
  ('public.get_user_growth_stats(text)', true, true),
  ('public.get_user_report_status_summary(uuid,uuid)', false, true),
  ('public.get_user_session_stats(uuid)', true, true),
  ('public.get_user_sessions(uuid)', true, true),
  ('public.get_user_tasks_with_relations(uuid,uuid,boolean,task_board_status[],boolean,boolean,uuid[],uuid[],uuid[],uuid[],boolean)', true, true),
  ('public.get_user_whitelist_status(uuid)', false, true),
  ('public.get_user_workspace_subscription_info(uuid)', false, true),
  ('public.get_wallet_balance_at_date(uuid,timestamp with time zone,boolean)', false, true),
  ('public.get_wallet_expense_count(uuid,uuid)', false, true),
  ('public.get_wallet_expense_count(uuid,uuid,boolean)', true, true),
  ('public.get_wallet_expense_sum(uuid,uuid)', false, true),
  ('public.get_wallet_expense_sum(uuid,uuid,boolean)', true, true),
  ('public.get_wallet_income_count(uuid,uuid)', false, true),
  ('public.get_wallet_income_count(uuid,uuid,boolean)', true, true),
  ('public.get_wallet_income_sum(uuid,uuid)', false, true),
  ('public.get_wallet_income_sum(uuid,uuid,boolean)', true, true),
  ('public.get_wallet_permission_context(uuid,uuid)', true, true),
  ('public.get_wallet_transactions_with_permissions(uuid,uuid,uuid[],uuid[],uuid[],uuid[],uuid[],text,text,timestamp with time zone,timestamp with time zone,text,text,integer,integer,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone)', true, true),
  ('public.get_wau_count()', true, true),
  ('public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date)', true, true),
  ('public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date,integer)', true, true),
  ('public.get_workspace_habit_tracker_latest_stats(uuid,uuid,uuid[])', true, true),
  ('public.get_workspace_member_count(uuid)', true, true),
  ('public.get_workspace_member_distribution()', true, true),
  ('public.get_workspace_overview(text,text,text,text,text,text,text,integer,integer)', false, true),
  ('public.get_workspace_overview_summary()', false, true),
  ('public.get_workspace_statistics()', true, true),
  ('public.get_workspace_storage_limit(uuid)', true, true),
  ('public.get_workspace_task_history(uuid,integer,integer,text,text,uuid,text,timestamp with time zone,timestamp with time zone)', true, true),
  ('public.get_workspace_time_tracking_stats(uuid,timestamp with time zone)', true, true),
  ('public.get_workspace_user_audit_view(uuid,timestamp with time zone,timestamp with time zone,text,text,text,text,text,integer,integer)', true, true),
  ('public.get_workspace_user_id(uuid,uuid)', false, true),
  ('public.get_workspace_users_require_attention(uuid,uuid[],uuid)', false, true),
  ('public.get_workspace_wallets_expense(uuid,timestamp with time zone,timestamp with time zone,boolean)', false, true),
  ('public.get_workspace_wallets_expense(uuid,uuid,timestamp with time zone,timestamp with time zone,boolean)', true, true),
  ('public.get_workspace_wallets_income(uuid,timestamp with time zone,timestamp with time zone,boolean)', false, true),
  ('public.get_workspace_wallets_income(uuid,uuid,timestamp with time zone,timestamp with time zone,boolean)', true, true),
  ('public.get_workspace_wallets_net_total(uuid,uuid,timestamp with time zone,timestamp with time zone,boolean)', true, false),
  ('public.handle_workspace_user_group_creator_assignment()', true, true),
  ('public.has_task_permission(uuid,text)', true, true),
  ('public.has_workspace_permission(uuid,uuid,text)', true, true),
  ('public.has_workspace_secret(uuid,text)', true, true),
  ('public.hook_mfa_verification_attempt(jsonb)', false, false),
  ('public.initialize_workspace_admin_permission()', true, true),
  ('public.insert_ai_chat_message(text,uuid,text)', true, true),
  ('public.insert_task_history(uuid,text,text,jsonb,jsonb,jsonb)', false, true),
  ('public.insert_task_history(uuid,text,text,jsonb,jsonb,jsonb,uuid)', false, true),
  ('public.insert_time_tracking_session_with_bypass(uuid,uuid,text,text,uuid,uuid,timestamp with time zone,timestamp with time zone,integer,boolean)', true, true),
  ('public.inventory_cent_level_prices_ready()', false, true),
  ('public.is_board_template_accessible(uuid)', true, true),
  ('public.is_hive_member(uuid)', true, true),
  ('public.is_hive_platform_admin(uuid)', true, true),
  ('public.is_list_accessible(uuid)', false, true),
  ('public.is_member_invited(uuid,uuid)', true, true),
  ('public.is_nova_challenge_manager()', true, true),
  ('public.is_org_member(uuid,uuid)', true, true),
  ('public.is_personal_workspace(uuid)', true, true),
  ('public.is_project_member(uuid)', false, true),
  ('public.is_reserved_username(text)', false, true),
  ('public.is_root_external_project_admin(uuid)', true, true),
  ('public.is_task_accessible(uuid)', true, true),
  ('public.is_task_board_member(uuid,uuid)', true, true),
  ('public.is_task_board_workspace_member(uuid)', false, true),
  ('public.is_task_plan_intended_workspace(uuid,uuid)', true, true),
  ('public.is_task_plan_personal_workspace(uuid,uuid)', true, true),
  ('public.is_task_plan_workspace_member(uuid,uuid)', true, true),
  ('public.is_task_progress_workspace_member(uuid,uuid)', true, true),
  ('public.is_task_sharing_enabled(uuid)', true, true),
  ('public.is_task_workspace_member(uuid)', true, true),
  ('public.is_tuturuuu_email(text)', true, true),
  ('public.is_user_suspended(uuid)', false, true),
  ('public.is_user_task_in_board(uuid,uuid)', false, true),
  ('public.is_user_whitelisted(uuid)', false, true),
  ('public.is_valid_personal_task_placement(uuid,uuid,uuid)', true, true),
  ('public.is_workspace_owner(uuid,uuid)', true, true),
  ('public.issue_profile_banner_upload(uuid,uuid)', false, true),
  ('public.list_deferred_calendar_google_imports(uuid,text,uuid)', false, true),
  ('public.list_immediate_notification_email_configs(text[])', false, true),
  ('public.list_product_feedback_staff(uuid,text,text,text,integer,timestamp with time zone,uuid)', false, true),
  ('public.list_trusted_subjects_for_cache(numeric)', false, true),
  ('public.list_workspace_user_audit_bucket_counts(uuid,timestamp with time zone,timestamp with time zone,text,text,text,text,text)', true, true),
  ('public.list_workspace_user_audit_feed(uuid,timestamp with time zone,timestamp with time zone,text,text,text,text,integer,integer)', true, true),
  ('public.list_workspace_user_audit_records(uuid,timestamp with time zone,timestamp with time zone)', false, true),
  ('public.lose_tulearn_heart(uuid,uuid)', true, true),
  ('public.merge_workspace_users(uuid,uuid,uuid)', true, true),
  ('public.merge_workspace_users_batch_update(uuid,uuid,uuid,text,text,integer)', true, true),
  ('public.merge_workspace_users_phase1(uuid,uuid,uuid)', true, true),
  ('public.merge_workspace_users_phase1a(uuid,uuid,uuid)', true, true),
  ('public.merge_workspace_users_phase1a_batch(uuid,uuid,uuid,integer)', true, true),
  ('public.merge_workspace_users_phase1b(uuid,uuid,uuid)', true, true),
  ('public.merge_workspace_users_phase1b_batch(uuid,uuid,uuid,integer)', true, true),
  ('public.merge_workspace_users_phase1c(uuid,uuid,uuid)', true, true),
  ('public.merge_workspace_users_phase1c_batch(uuid,uuid,uuid,integer)', true, true),
  ('public.merge_workspace_users_phase1d(uuid,uuid,uuid)', true, true),
  ('public.merge_workspace_users_phase1d_batch(uuid,uuid,uuid,integer)', true, true),
  ('public.merge_workspace_users_phase2(uuid,uuid,uuid)', true, true),
  ('public.merge_workspace_users_phase3(uuid,uuid,uuid)', true, true),
  ('public.merge_workspace_users_phase4(uuid,uuid,uuid)', true, true),
  ('public.merge_workspace_users_phase5(uuid,uuid,uuid)', true, true),
  ('public.merge_workspace_users_phased(uuid,uuid,uuid,integer)', true, true),
  ('public.merge_workspace_users_table_batch(uuid,uuid,uuid,text,text,integer)', true, true),
  ('public.migrate_email_notifications_on_login()', false, true),
  ('public.migrate_email_notifications_on_signup()', false, true),
  ('public.normalize_related_relationship()', true, true),
  ('public.normalize_task_sort_keys()', false, true),
  ('public.notify_task_assigned()', true, true),
  ('public.notify_task_assignee_added()', true, true),
  ('public.notify_task_assignee_removed()', true, true),
  ('public.notify_task_created()', true, true),
  ('public.notify_task_label_added()', true, true),
  ('public.notify_task_label_removed()', true, true),
  ('public.notify_task_project_linked()', true, true),
  ('public.notify_task_project_unlinked()', true, true),
  ('public.notify_task_updated()', true, true),
  ('public.notify_workspace_email_invite()', true, true),
  ('public.notify_workspace_user_invite()', true, true),
  ('public.on_delete_user()', true, true),
  ('public.pause_session_for_break(uuid,timestamp with time zone,integer)', true, true),
  ('public.pause_session_for_break(uuid,timestamp with time zone,integer,boolean)', true, true),
  ('public.pending_profile_banner_retirements(uuid)', false, true),
  ('public.prevent_circular_parent_child()', true, true),
  ('public.prevent_personal_workspace_deletion()', true, true),
  ('public.prevent_personal_workspace_threshold_modification()', true, true),
  ('public.process_notification_batches()', false, true),
  ('public.profile_banner_operation_status(uuid,uuid)', false, true),
  ('public.reattach_platform_entity_creation_limit_trigger(text)', false, true),
  ('public.record_abuse_activity_signal(jsonb,abuse_signal_type,integer,integer,uuid,uuid,text,uuid,text,text,abuse_risk_tier,text,jsonb)', false, true),
  ('public.record_email_bounce(text,text,text,uuid,jsonb)', false, true),
  ('public.record_email_complaint(text,text,text,uuid,jsonb)', false, true),
  ('public.record_mira_interaction(uuid)', false, true),
  ('public.record_profile_banner_ticket(uuid,uuid)', false, true),
  ('public.record_task_reminder_sent(uuid,uuid,text,uuid)', false, true),
  ('public.redirect_platform_email_roles_insert()', true, true),
  ('public.release_fixed_ai_credit_reservation(uuid,jsonb)', false, true),
  ('public.release_inventory_checkout_session(uuid,uuid,timestamp with time zone)', false, true),
  ('public.release_metered_embedding_credits(uuid,jsonb)', false, true),
  ('public.remove_assignee_from_task_templates()', true, true),
  ('public.remove_label_from_task_templates()', true, true),
  ('public.remove_project_from_task_templates()', true, true),
  ('public.reorder_workspace_course_module_groups(uuid,uuid[])', false, true),
  ('public.reorder_workspace_course_modules(uuid,uuid[])', false, true),
  ('public.reorder_workspace_course_modules_in_module_group(uuid,uuid[])', false, true),
  ('public.replace_workspace_external_project_relation_definition_targets(uuid,uuid,uuid[],uuid)', true, true),
  ('public.reserve_fixed_ai_credits(uuid,uuid,numeric,text,text,jsonb,integer)', false, true),
  ('public.reserve_metered_embedding_credits(uuid,uuid,text,integer,text,jsonb,integer)', false, true),
  ('public.reserve_security_budget(jsonb)', false, true),
  ('public.resolve_guest_self_join_candidate(uuid,uuid)', true, true),
  ('public.revert_task_to_history(uuid,uuid,uuid,text[])', true, false),
  ('public.revert_task_to_history_for_actor(uuid,uuid,uuid,uuid,text[])', false, true),
  ('public.revoke_all_cross_app_tokens(uuid)', true, true),
  ('public.revoke_all_other_sessions(uuid)', true, true),
  ('public.revoke_user_session(uuid,text)', true, true),
  ('public.search_finance_invoices(uuid,text,timestamp with time zone,timestamp with time zone,uuid[],uuid[],integer,integer)', true, true),
  ('public.set_default_break_type(uuid,uuid)', false, true),
  ('public.set_first_workspace_as_default()', true, true),
  ('public.set_transaction_platform_creator()', true, true),
  ('public.set_workspace_external_project_binding(uuid,text)', true, true),
  ('public.settle_metered_ai_credit_reservation(uuid,integer,integer,integer,jsonb)', false, true),
  ('public.should_send_notification(uuid,text,text,notification_scope,uuid)', false, true),
  ('public.sso_append_audit(uuid,uuid,uuid,uuid,text,bigint)', false, true),
  ('public.sso_bind_transaction(uuid,uuid,uuid,uuid,text,text,bigint)', false, true),
  ('public.sso_consume_transaction(uuid,uuid,uuid,uuid,text,text,bigint)', false, true),
  ('public.sso_create_transaction(uuid,uuid,bigint,text,text,text,text,text,timestamp with time zone,boolean,text)', false, true),
  ('public.sso_finalize_issuance(uuid,uuid,uuid,uuid,bigint,uuid,bigint)', false, true),
  ('public.sso_issuance_snapshot(uuid,uuid)', false, true),
  ('public.sso_manage_client(uuid,uuid,uuid,bigint,text,text[],text,text[],boolean)', false, true),
  ('public.sso_management_detail(uuid,uuid,uuid)', false, true),
  ('public.sso_management_overview(uuid,uuid)', false, true),
  ('public.sso_read_own_disclosures(uuid)', true, false),
  ('public.sso_record_consent(uuid,uuid,uuid,uuid,text,text,bigint,boolean)', false, true),
  ('public.sso_reject_transaction(uuid,uuid,uuid,text,uuid,bigint)', false, true),
  ('public.sso_save_saml_client(uuid,uuid,bigint,text,text[],text,text,text,text,boolean,uuid)', false, true),
  ('public.sso_set_assignment(uuid,uuid,uuid,uuid,bigint,boolean)', false, true),
  ('public.sso_set_client_enabled(uuid,uuid,uuid,bigint,boolean)', false, true),
  ('public.store_task_metadata_before_delete()', true, true),
  ('public.submit_product_feedback(uuid,uuid,text,text)', false, true),
  ('public.submit_product_feedback_with_media(uuid,uuid,text,text,text)', false, true),
  ('public.summarize_workspace_user_audit_feed(uuid,timestamp with time zone,timestamp with time zone,text,text,text,text)', true, true),
  ('public.sync_external_project_entry_taxonomy_assignments()', true, true),
  ('public.sync_my_notifications()', true, true),
  ('public.sync_user_details()', true, true),
  ('public.sync_user_private_details()', true, true),
  ('public.task_reminder_already_sent(uuid,uuid,text)', false, true),
  ('public.transition_account_mfa_policy(uuid,jsonb,jsonb,boolean)', false, true),
  ('public.trigger_cleanup_expired_cross_app_tokens()', false, true),
  ('public.trigger_cleanup_qr_login_challenges()', true, true),
  ('public.trigger_immediate_notification_send()', false, true),
  ('public.update_platform_entity_creation_limit_metadata(text,text,uuid)', false, true),
  ('public.update_platform_entity_creation_limit_tier(text,workspace_product_tier,boolean,integer,integer,integer,integer,integer,uuid)', false, true),
  ('public.update_public_user_profile(uuid,jsonb)', false, true),
  ('public.update_public_user_profile_with_banner_lifecycle(uuid,jsonb,text)', false, true),
  ('public.update_time_tracking_session_with_bypass(uuid,jsonb)', true, true),
  ('public.update_time_tracking_threshold_settings(uuid,integer,boolean,integer)', true, true),
  ('public.update_workspace_configs_with_approval_transitions(uuid,jsonb,uuid)', true, true),
  ('public.upsert_course_test_question(uuid,uuid,uuid,jsonb)', false, true),
  ('public.upsert_personal_task_placement(uuid,uuid,uuid,uuid,double precision,uuid,uuid)', true, true),
  ('public.upsert_realtime_log_aggregations(jsonb)', false, true),
  ('public.upsert_workspace_external_project_entry_bundle(uuid,uuid,jsonb,jsonb,jsonb,uuid,timestamp with time zone)', true, true),
  ('public.upsert_workspace_subscription_error(uuid,text,text)', false, true),
  ('public.user_has_wallet_access_via_role(uuid,uuid,uuid)', true, true),
  ('public.user_is_in_channel(uuid,uuid)', true, true),
  ('public.validate_cross_app_token(text,text)', true, true),
  ('public.validate_cross_app_token_with_session(text,text)', true, true),
  ('public.validate_sepay_wallet_link_workspace()', true, true),
  ('public.validate_sepay_webhook_endpoint_workspace()', true, true),
  ('public.validate_sepay_webhook_event_workspace()', true, true),
  ('public.validate_task_draft_assignee_ids()', true, true),
  ('public.validate_task_draft_label_ids()', true, true),
  ('public.validate_task_draft_project_ids()', true, true),
  ('public.validate_task_relationship_scope()', true, true),
  ('public.validate_task_template_scope()', true, true),
  ('public.workspace_has_available_seats(uuid)', true, true),
  ('public.workspace_user_audit_feed(uuid,timestamp with time zone,timestamp with time zone)', false, true),
  ('public.workspace_user_audit_filtered_feed(uuid,timestamp with time zone,timestamp with time zone,text,text,text,text)', true, true);
-- Named final intent: B's internal/reporting RPCs and C's administrative
-- summaries admit only service_role, even for an authenticated workspace creator.
CREATE TEMP TABLE definer_service_role_only_expected (signature text PRIMARY KEY);
INSERT INTO definer_service_role_only_expected VALUES
  ('public.get_workspace_overview(text,text,text,text,text,text,text,integer,integer)'),
  ('public.get_recent_audit_logs(integer)'),
  ('public.get_power_users(integer)'),
  ('public.deduct_ai_credits(uuid,text,integer,integer,integer,text,uuid,uuid,jsonb)'),
  ('public.deduct_ai_credits(uuid,text,integer,integer,integer,text,uuid,uuid,jsonb,uuid,integer,integer)'),
  ('public.get_or_create_credit_balance(uuid)'),
  ('public.get_or_create_credit_balance(uuid,uuid)'),
  ('public.get_ai_credit_usage_summary(uuid,timestamptz)'),
  ('public.get_ai_credit_usage_summary(uuid,timestamptz,uuid)'),
  ('public.admin_list_ai_credit_transactions(integer,integer,uuid,uuid,text,text,text,text,timestamptz,timestamptz)'),
  ('public.cleanup_role_inconsistencies()'),
  ('public.normalize_task_sort_keys()'),
  ('public.get_bounce_complaint_stats(timestamptz)'),
  ('public.get_workspace_overview_summary()'),
  ('public.create_missing_personal_workspaces()'),
  ('public.get_group_report_status_summary(uuid)'),
  ('public.get_user_report_status_summary(uuid,uuid)');
SELECT ok(to_regprocedure(signature) IS NOT NULL
  AND NOT has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE')
  AND has_function_privilege('service_role', to_regprocedure(signature), 'EXECUTE'),
  'reviewed B/C service_role-only expectation: ' || signature)
FROM definer_service_role_only_expected ORDER BY signature;
SELECT ok(to_regprocedure('public.get_or_create_notification_batch(uuid,uuid,text,integer)') IS NULL,
  'reviewed C expectation: broken four-argument notification batching overload is absent');
SELECT ok(to_regprocedure('public.get_or_create_notification_batch(uuid,uuid,text,integer,text)') IS NULL,
  'reviewed C expectation: broken five-argument notification batching overload is absent');

SELECT is((SELECT count(*)::integer FROM definer_execute_expected e
  WHERE to_regprocedure(e.signature) IS NULL
    OR e.authenticated IS DISTINCT FROM has_function_privilege('authenticated', to_regprocedure(e.signature), 'EXECUTE')),
  0, 'authenticated EXECUTE matches the reviewed final A/B/C expectations');
SELECT is((SELECT count(*)::integer FROM definer_execute_expected e
  WHERE to_regprocedure(e.signature) IS NULL
    OR e.service_role IS DISTINCT FROM has_function_privilege('service_role', to_regprocedure(e.signature), 'EXECUTE')),
  0, 'service_role EXECUTE matches the reviewed final A/B/C expectations');
SELECT is((SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND p.proname NOT IN ('sb19_default_probe')
    AND NOT EXISTS (SELECT 1 FROM definer_execute_expected e
      WHERE to_regprocedure(e.signature)::oid = p.oid)), 0,
  'the reviewed final expectations cover every existing public definer');
SELECT ok(has_schema_privilege('supabase_auth_admin', 'public', 'USAGE')
  AND has_function_privilege('supabase_auth_admin', 'public.hook_mfa_verification_attempt(jsonb)', 'EXECUTE'),
  'Auth MFA hook retains schema USAGE and EXECUTE for supabase_auth_admin');

CREATE TABLE public.sb19_policy_probe (ws_id uuid);
INSERT INTO public.sb19_policy_probe VALUES ('00000000-0000-0000-0000-000000000000');
ALTER TABLE public.sb19_policy_probe ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.sb19_policy_probe TO anon;
CREATE POLICY sb19_policy_probe ON public.sb19_policy_probe FOR SELECT TO anon
  USING (public.is_org_member(auth.uid(), ws_id)
    OR public.has_workspace_permission(ws_id, auth.uid(), 'view_transactions'));
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM public.sb19_policy_probe), 0,
  'row-bearing anonymous policy evaluation returns zero rows without a privilege error');
RESET ROLE;
CREATE FUNCTION pg_temp.sb19_signed_in_default_probe() RETURNS integer
LANGUAGE sql SET search_path = pg_catalog, pg_temp AS $$SELECT 1$$;
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.sb19_signed_in_default_probe(), 1,
  'signed-in callers retain the old global default on temporary invoker helpers');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT is(pg_temp.sb19_signed_in_default_probe(), 1,
  'service callers retain the old global default on temporary invoker helpers');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
