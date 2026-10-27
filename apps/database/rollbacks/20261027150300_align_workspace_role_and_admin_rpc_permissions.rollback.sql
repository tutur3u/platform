-- Manual rollback only. Retain the backup for 30 days, forensics.
-- A conflicting live row or a missing parent aborts restoration atomically;
-- reconcile it rather than discarding or overwriting the forensic copy.
BEGIN;
LOCK TABLE public.workspace_roles, public.workspace_role_permissions
  IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public.workspace_role_permissions
  DROP CONSTRAINT public_workspace_role_permissions_role_id_fkey,
  ADD CONSTRAINT public_workspace_role_permissions_role_id_fkey
    FOREIGN KEY (role_id) REFERENCES public.workspace_roles (id)
    ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.workspace_roles DROP CONSTRAINT workspace_roles_id_ws_id_key;
INSERT INTO public.workspace_role_permissions (ws_id, permission, enabled, created_at, role_id)
SELECT ws_id, permission, enabled, created_at, role_id
FROM private_forensics.sec_role_permission_ws_mismatch_backup_20261027;



ALTER FUNCTION public.admin_list_ai_credit_transactions(p_page integer, p_limit integer, p_ws_id uuid, p_user_id uuid, p_scope text, p_transaction_type text, p_feature text, p_model_id text, p_start_date timestamp with time zone, p_end_date timestamp with time zone) SET search_path = public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public.admin_list_ai_credit_transactions(p_page integer, p_limit integer, p_ws_id uuid, p_user_id uuid, p_scope text, p_transaction_type text, p_feature text, p_model_id text, p_start_date timestamp with time zone, p_end_date timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_ai_credit_transactions(p_page integer, p_limit integer, p_ws_id uuid, p_user_id uuid, p_scope text, p_transaction_type text, p_feature text, p_model_id text, p_start_date timestamp with time zone, p_end_date timestamp with time zone) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_ai_credit_transactions(p_page integer, p_limit integer, p_ws_id uuid, p_user_id uuid, p_scope text, p_transaction_type text, p_feature text, p_model_id text, p_start_date timestamp with time zone, p_end_date timestamp with time zone) TO "anon";
GRANT EXECUTE ON FUNCTION public.admin_list_ai_credit_transactions(p_page integer, p_limit integer, p_ws_id uuid, p_user_id uuid, p_scope text, p_transaction_type text, p_feature text, p_model_id text, p_start_date timestamp with time zone, p_end_date timestamp with time zone) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.admin_list_ai_credit_transactions(p_page integer, p_limit integer, p_ws_id uuid, p_user_id uuid, p_scope text, p_transaction_type text, p_feature text, p_model_id text, p_start_date timestamp with time zone, p_end_date timestamp with time zone) TO "service_role";
ALTER FUNCTION public.get_action_frequency_by_hour() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_action_frequency_by_hour() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_action_frequency_by_hour() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_action_frequency_by_hour() TO "anon";
GRANT EXECUTE ON FUNCTION public.get_action_frequency_by_hour() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_action_frequency_by_hour() TO "service_role";
ALTER FUNCTION public.get_active_sessions_count() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_active_sessions_count() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_active_sessions_count() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_sessions_count() TO "anon";
GRANT EXECUTE ON FUNCTION public.get_active_sessions_count() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_active_sessions_count() TO "service_role";
ALTER FUNCTION public.get_activity_heatmap() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_activity_heatmap() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_activity_heatmap() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_activity_heatmap() TO "anon";
GRANT EXECUTE ON FUNCTION public.get_activity_heatmap() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_activity_heatmap() TO "service_role";
ALTER FUNCTION public.get_ai_credit_usage_summary(p_ws_id uuid, p_period_start timestamp with time zone) SET search_path = public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public.get_ai_credit_usage_summary(p_ws_id uuid, p_period_start timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_credit_usage_summary(p_ws_id uuid, p_period_start timestamp with time zone) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ai_credit_usage_summary(p_ws_id uuid, p_period_start timestamp with time zone) TO "anon";
GRANT EXECUTE ON FUNCTION public.get_ai_credit_usage_summary(p_ws_id uuid, p_period_start timestamp with time zone) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_ai_credit_usage_summary(p_ws_id uuid, p_period_start timestamp with time zone) TO "service_role";
ALTER FUNCTION public.get_ai_credit_usage_summary(p_ws_id uuid, p_period_start timestamp with time zone, p_user_id uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_ai_credit_usage_summary(p_ws_id uuid, p_period_start timestamp with time zone, p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_credit_usage_summary(p_ws_id uuid, p_period_start timestamp with time zone, p_user_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ai_credit_usage_summary(p_ws_id uuid, p_period_start timestamp with time zone, p_user_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public.get_ai_credit_usage_summary(p_ws_id uuid, p_period_start timestamp with time zone, p_user_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_ai_credit_usage_summary(p_ws_id uuid, p_period_start timestamp with time zone, p_user_id uuid) TO "service_role";
ALTER FUNCTION public.get_auth_provider_stats() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_auth_provider_stats() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_auth_provider_stats() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_provider_stats() TO "anon";
GRANT EXECUTE ON FUNCTION public.get_auth_provider_stats() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_auth_provider_stats() TO "service_role";
ALTER FUNCTION public.get_auth_session_statistics() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_auth_session_statistics() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_auth_session_statistics() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_session_statistics() TO "anon";
GRANT EXECUTE ON FUNCTION public.get_auth_session_statistics() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_auth_session_statistics() TO "service_role";
ALTER FUNCTION public.get_dau_count() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_dau_count() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dau_count() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dau_count() TO "anon";
GRANT EXECUTE ON FUNCTION public.get_dau_count() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_dau_count() TO "service_role";
ALTER FUNCTION public.get_engagement_metrics_over_time(days integer) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_engagement_metrics_over_time(days integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_engagement_metrics_over_time(days integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_engagement_metrics_over_time(days integer) TO "anon";
GRANT EXECUTE ON FUNCTION public.get_engagement_metrics_over_time(days integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_engagement_metrics_over_time(days integer) TO "service_role";
ALTER FUNCTION public.get_feature_adoption(feature_action_prefix text) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_feature_adoption(feature_action_prefix text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_feature_adoption(feature_action_prefix text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_feature_adoption(feature_action_prefix text) TO "anon";
GRANT EXECUTE ON FUNCTION public.get_feature_adoption(feature_action_prefix text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_feature_adoption(feature_action_prefix text) TO "service_role";
ALTER FUNCTION public.get_mau_count() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_mau_count() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_mau_count() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mau_count() TO "anon";
GRANT EXECUTE ON FUNCTION public.get_mau_count() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_mau_count() TO "service_role";
ALTER FUNCTION public.get_or_create_credit_balance(p_ws_id uuid) SET search_path = public, private, pg_temp;
REVOKE ALL ON FUNCTION public.get_or_create_credit_balance(p_ws_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_credit_balance(p_ws_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_credit_balance(p_ws_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public.get_or_create_credit_balance(p_ws_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_or_create_credit_balance(p_ws_id uuid) TO "service_role";
ALTER FUNCTION public.get_or_create_credit_balance(p_ws_id uuid, p_user_id uuid) SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.get_or_create_credit_balance(p_ws_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_credit_balance(p_ws_id uuid, p_user_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_credit_balance(p_ws_id uuid, p_user_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public.get_or_create_credit_balance(p_ws_id uuid, p_user_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_or_create_credit_balance(p_ws_id uuid, p_user_id uuid) TO "service_role";
ALTER FUNCTION public.get_power_users(limit_count integer) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_power_users(limit_count integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_power_users(limit_count integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_power_users(limit_count integer) TO "anon";
GRANT EXECUTE ON FUNCTION public.get_power_users(limit_count integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_power_users(limit_count integer) TO "service_role";
ALTER FUNCTION public.get_recent_actions_summary(limit_count integer) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_recent_actions_summary(limit_count integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_actions_summary(limit_count integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recent_actions_summary(limit_count integer) TO "anon";
GRANT EXECUTE ON FUNCTION public.get_recent_actions_summary(limit_count integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_recent_actions_summary(limit_count integer) TO "service_role";
ALTER FUNCTION public.get_recent_audit_logs(limit_count integer) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_recent_audit_logs(limit_count integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_audit_logs(limit_count integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recent_audit_logs(limit_count integer) TO "anon";
GRANT EXECUTE ON FUNCTION public.get_recent_audit_logs(limit_count integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_recent_audit_logs(limit_count integer) TO "service_role";
ALTER FUNCTION public.get_retention_rate(period text) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_retention_rate(period text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_retention_rate(period text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_retention_rate(period text) TO "anon";
GRANT EXECUTE ON FUNCTION public.get_retention_rate(period text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_retention_rate(period text) TO "service_role";
ALTER FUNCTION public.get_sessions_by_device() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_sessions_by_device() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_sessions_by_device() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sessions_by_device() TO "anon";
GRANT EXECUTE ON FUNCTION public.get_sessions_by_device() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_sessions_by_device() TO "service_role";
ALTER FUNCTION public.get_sign_ins_by_provider(days integer) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_sign_ins_by_provider(days integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_sign_ins_by_provider(days integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sign_ins_by_provider(days integer) TO "anon";
GRANT EXECUTE ON FUNCTION public.get_sign_ins_by_provider(days integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_sign_ins_by_provider(days integer) TO "service_role";
ALTER FUNCTION public.get_user_activity_cohorts() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_user_activity_cohorts() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_activity_cohorts() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_activity_cohorts() TO "anon";
GRANT EXECUTE ON FUNCTION public.get_user_activity_cohorts() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_user_activity_cohorts() TO "service_role";
ALTER FUNCTION public.get_user_growth_comparison() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_user_growth_comparison() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_growth_comparison() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_growth_comparison() TO "anon";
GRANT EXECUTE ON FUNCTION public.get_user_growth_comparison() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_user_growth_comparison() TO "service_role";
ALTER FUNCTION public.get_user_growth_stats(time_period text) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_user_growth_stats(time_period text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_growth_stats(time_period text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_growth_stats(time_period text) TO "anon";
GRANT EXECUTE ON FUNCTION public.get_user_growth_stats(time_period text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_user_growth_stats(time_period text) TO "service_role";
ALTER FUNCTION public.get_wau_count() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_wau_count() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_wau_count() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_wau_count() TO "anon";
GRANT EXECUTE ON FUNCTION public.get_wau_count() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_wau_count() TO "service_role";
ALTER FUNCTION public.get_workspace_member_distribution() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_workspace_member_distribution() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_member_distribution() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workspace_member_distribution() TO "anon";
GRANT EXECUTE ON FUNCTION public.get_workspace_member_distribution() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_workspace_member_distribution() TO "service_role";
ALTER FUNCTION public.get_workspace_statistics() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_workspace_statistics() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_statistics() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workspace_statistics() TO "anon";
GRANT EXECUTE ON FUNCTION public.get_workspace_statistics() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.get_workspace_statistics() TO "service_role";
CREATE OR REPLACE FUNCTION public.replace_workspace_external_project_relation_definition_targets(p_ws_id uuid, p_definition_id uuid, p_target_collection_ids uuid[], p_actor_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_target_ids uuid[] := COALESCE(p_target_collection_ids, ARRAY[]::uuid[]);
  v_distinct_count integer;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'authenticated actor is required' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_actor_id THEN
    RAISE EXCEPTION 'actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_manage_workspace_external_projects(p_ws_id, p_actor_id) THEN
    RAISE EXCEPTION 'manage external projects permission required' USING ERRCODE = '42501';
  END IF;
  PERFORM 1
  FROM public.workspace_external_project_relation_definitions
  WHERE ws_id = p_ws_id AND id = p_definition_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'relation definition not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(DISTINCT target_id) INTO v_distinct_count
  FROM unnest(v_target_ids) AS requested(target_id);

  IF v_distinct_count <> (
    SELECT count(*)
    FROM public.workspace_external_project_collections collection
    WHERE collection.ws_id = p_ws_id
      AND collection.id IN (SELECT DISTINCT target_id FROM unnest(v_target_ids) AS requested(target_id))
  ) THEN
    RAISE EXCEPTION 'invalid relation target collection' USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.workspace_external_project_relation_definition_targets
  WHERE ws_id = p_ws_id AND relation_definition_id = p_definition_id;

  INSERT INTO public.workspace_external_project_relation_definition_targets (
    ws_id, relation_definition_id, target_collection_id
  )
  SELECT p_ws_id, p_definition_id, target_id
  FROM (
    SELECT DISTINCT target_id
    FROM unnest(v_target_ids) AS requested(target_id)
  ) deduplicated;

  RETURN ARRAY(
    SELECT target_collection_id
    FROM public.workspace_external_project_relation_definition_targets
    WHERE ws_id = p_ws_id AND relation_definition_id = p_definition_id
    ORDER BY target_collection_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.replace_workspace_external_project_relation_definition_targets(p_ws_id uuid, p_definition_id uuid, p_target_collection_ids uuid[], p_actor_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_workspace_external_project_relation_definition_targets(p_ws_id uuid, p_definition_id uuid, p_target_collection_ids uuid[], p_actor_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.replace_workspace_external_project_relation_definition_targets(p_ws_id uuid, p_definition_id uuid, p_target_collection_ids uuid[], p_actor_id uuid) TO "service_role";
CREATE OR REPLACE FUNCTION public.upsert_workspace_external_project_entry_bundle(p_ws_id uuid, p_actor_id uuid, p_entry jsonb, p_blocks jsonb DEFAULT '[]'::jsonb, p_relations jsonb DEFAULT '[]'::jsonb, p_entry_id uuid DEFAULT NULL::uuid, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_entry public.workspace_external_project_entries%ROWTYPE;
  v_block jsonb;
  v_block_id uuid;
  v_block_ids uuid[] := ARRAY[]::uuid[];
  v_relation jsonb;
  v_definition public.workspace_external_project_relation_definitions%ROWTYPE;
  v_target_entry public.workspace_external_project_entries%ROWTYPE;
  v_relation_count integer;
  v_collection_id uuid;
  v_now timestamp with time zone := timezone('utc'::text, now());
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'authenticated actor is required' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_actor_id THEN
    RAISE EXCEPTION 'actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_manage_workspace_external_projects(p_ws_id, p_actor_id) THEN
    RAISE EXCEPTION 'manage external projects permission required' USING ERRCODE = '42501';
  END IF;
  IF p_entry->>'status' = 'published'
    AND NOT public.can_publish_workspace_external_projects(p_ws_id, p_actor_id)
  THEN
    RAISE EXCEPTION 'publish external projects permission required' USING ERRCODE = '42501';
  END IF;

  IF p_entry IS NULL OR jsonb_typeof(p_entry) <> 'object' THEN
    RAISE EXCEPTION 'entry must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_blocks) <> 'array' OR jsonb_typeof(p_relations) <> 'array' THEN
    RAISE EXCEPTION 'blocks and relations must be JSON arrays' USING ERRCODE = '22023';
  END IF;

  IF p_entry_id IS NULL THEN
    v_collection_id := NULLIF(p_entry->>'collectionId', '')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.workspace_external_project_collections
      WHERE ws_id = p_ws_id AND id = v_collection_id
    ) THEN
      RAISE EXCEPTION 'invalid entry collection' USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.workspace_external_project_entries (
      ws_id, collection_id, slug, title, subtitle, summary, status,
      scheduled_for, published_at, sort_order, profile_data, metadata,
      stable_source_id, source_adapter, created_by, updated_by
    ) VALUES (
      p_ws_id,
      v_collection_id,
      trim(p_entry->>'slug'),
      trim(p_entry->>'title'),
      NULLIF(p_entry->>'subtitle', ''),
      NULLIF(p_entry->>'summary', ''),
      COALESCE((p_entry->>'status')::public.external_project_entry_status, 'draft'),
      NULLIF(p_entry->>'scheduledFor', '')::timestamp with time zone,
      CASE WHEN COALESCE(p_entry->>'status', 'draft') = 'published' THEN v_now ELSE NULL END,
      COALESCE((p_entry->>'sortOrder')::integer, 0),
      COALESCE(p_entry->'profileData', '{}'::jsonb),
      COALESCE(p_entry->'metadata', '{}'::jsonb),
      NULLIF(p_entry->>'stableSourceId', ''),
      NULLIF(p_entry->>'sourceAdapter', '')::public.external_project_adapter_kind,
      p_actor_id,
      p_actor_id
    ) RETURNING * INTO v_entry;
  ELSE
    SELECT * INTO v_entry
    FROM public.workspace_external_project_entries
    WHERE ws_id = p_ws_id AND id = p_entry_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'entry not found' USING ERRCODE = 'P0002';
    END IF;
    IF p_expected_updated_at IS NOT NULL AND v_entry.updated_at <> p_expected_updated_at THEN
      RAISE EXCEPTION 'entry update conflict' USING ERRCODE = '40001';
    END IF;
    IF p_entry ? 'collectionId' THEN
      v_collection_id := NULLIF(p_entry->>'collectionId', '')::uuid;
      IF NOT EXISTS (
        SELECT 1 FROM public.workspace_external_project_collections
        WHERE ws_id = p_ws_id AND id = v_collection_id
      ) THEN
        RAISE EXCEPTION 'invalid entry collection' USING ERRCODE = '23503';
      END IF;
    END IF;

    UPDATE public.workspace_external_project_entries SET
      collection_id = COALESCE(NULLIF(p_entry->>'collectionId', '')::uuid, collection_id),
      slug = CASE WHEN p_entry ? 'slug' THEN trim(p_entry->>'slug') ELSE slug END,
      title = CASE WHEN p_entry ? 'title' THEN trim(p_entry->>'title') ELSE title END,
      subtitle = CASE WHEN p_entry ? 'subtitle' THEN NULLIF(p_entry->>'subtitle', '') ELSE subtitle END,
      summary = CASE WHEN p_entry ? 'summary' THEN NULLIF(p_entry->>'summary', '') ELSE summary END,
      status = CASE WHEN p_entry ? 'status' THEN (p_entry->>'status')::public.external_project_entry_status ELSE status END,
      scheduled_for = CASE WHEN p_entry ? 'scheduledFor' THEN NULLIF(p_entry->>'scheduledFor', '')::timestamp with time zone ELSE scheduled_for END,
      published_at = CASE
        WHEN p_entry ? 'status' AND p_entry->>'status' = 'published' AND status <> 'published' THEN v_now
        WHEN p_entry ? 'status' AND p_entry->>'status' <> 'published' THEN NULL
        ELSE published_at
      END,
      sort_order = CASE WHEN p_entry ? 'sortOrder' THEN (p_entry->>'sortOrder')::integer ELSE sort_order END,
      profile_data = CASE WHEN p_entry ? 'profileData' THEN p_entry->'profileData' ELSE profile_data END,
      metadata = CASE WHEN p_entry ? 'metadata' THEN p_entry->'metadata' ELSE metadata END,
      updated_by = p_actor_id
    WHERE ws_id = p_ws_id AND id = p_entry_id
    RETURNING * INTO v_entry;

    -- Move existing blocks out of the caller-provided ordering range before
    -- applying replacements so swapping two block positions remains atomic.
    UPDATE public.workspace_external_project_blocks
    SET sort_order = sort_order + 1000000
    WHERE ws_id = p_ws_id AND entry_id = v_entry.id;
  END IF;

  FOR v_block IN SELECT value FROM jsonb_array_elements(p_blocks)
  LOOP
    v_block_id := NULLIF(v_block->>'id', '')::uuid;
    IF v_block_id IS NULL THEN
      INSERT INTO public.workspace_external_project_blocks (
        ws_id, entry_id, block_type, title, content, sort_order,
        stable_source_id, created_by, updated_by
      ) VALUES (
        p_ws_id, v_entry.id, trim(v_block->>'blockType'),
        NULLIF(v_block->>'title', ''), COALESCE(v_block->'content', '{}'::jsonb),
        COALESCE((v_block->>'sortOrder')::integer, 0),
        NULLIF(v_block->>'stableSourceId', ''), p_actor_id, p_actor_id
      ) RETURNING id INTO v_block_id;
    ELSE
      UPDATE public.workspace_external_project_blocks SET
        block_type = trim(v_block->>'blockType'),
        title = NULLIF(v_block->>'title', ''),
        content = COALESCE(v_block->'content', '{}'::jsonb),
        sort_order = COALESCE((v_block->>'sortOrder')::integer, 0),
        updated_by = p_actor_id
      WHERE ws_id = p_ws_id AND entry_id = v_entry.id AND id = v_block_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'block does not belong to entry' USING ERRCODE = '23503';
      END IF;
    END IF;
    v_block_ids := array_append(v_block_ids, v_block_id);
  END LOOP;

  DELETE FROM public.workspace_external_project_blocks
  WHERE ws_id = p_ws_id AND entry_id = v_entry.id
    AND NOT (id = ANY(v_block_ids));

  DELETE FROM public.workspace_external_project_entry_relations
  WHERE ws_id = p_ws_id AND from_entry_id = v_entry.id;

  FOR v_relation IN SELECT value FROM jsonb_array_elements(p_relations)
  LOOP
    SELECT * INTO v_definition
    FROM public.workspace_external_project_relation_definitions
    WHERE ws_id = p_ws_id
      AND id = NULLIF(v_relation->>'definitionId', '')::uuid
      AND source_collection_id = v_entry.collection_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid relation definition' USING ERRCODE = '23503';
    END IF;

    SELECT * INTO v_target_entry
    FROM public.workspace_external_project_entries
    WHERE ws_id = p_ws_id AND id = NULLIF(v_relation->>'toEntryId', '')::uuid;
    IF NOT FOUND OR NOT EXISTS (
      SELECT 1
      FROM public.workspace_external_project_relation_definition_targets
      WHERE ws_id = p_ws_id
        AND relation_definition_id = v_definition.id
        AND target_collection_id = v_target_entry.collection_id
    ) THEN
      RAISE EXCEPTION 'invalid relation target' USING ERRCODE = '23503';
    END IF;

    IF v_definition.cardinality = 'one' THEN
      SELECT count(*) INTO v_relation_count
      FROM public.workspace_external_project_entry_relations
      WHERE ws_id = p_ws_id
        AND from_entry_id = v_entry.id
        AND relation_definition_id = v_definition.id;
      IF v_relation_count > 0 THEN
        RAISE EXCEPTION 'relation cardinality exceeded' USING ERRCODE = '23514';
      END IF;
    END IF;

    INSERT INTO public.workspace_external_project_entry_relations (
      ws_id, from_entry_id, to_entry_id, relation_definition_id,
      relation_type, metadata, sort_order
    ) VALUES (
      p_ws_id, v_entry.id, v_target_entry.id, v_definition.id,
      v_definition.key, COALESCE(v_relation->'metadata', '{}'::jsonb),
      COALESCE((v_relation->>'sortOrder')::integer, 0)
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.workspace_external_project_relation_definitions definition
    WHERE definition.ws_id = p_ws_id
      AND definition.source_collection_id = v_entry.collection_id
      AND definition.is_required
      AND NOT EXISTS (
        SELECT 1
        FROM public.workspace_external_project_entry_relations relation
        WHERE relation.ws_id = p_ws_id
          AND relation.from_entry_id = v_entry.id
          AND relation.relation_definition_id = definition.id
      )
  ) THEN
    RAISE EXCEPTION 'required relation is missing' USING ERRCODE = '23502';
  END IF;

  SELECT * INTO v_entry
  FROM public.workspace_external_project_entries
  WHERE ws_id = p_ws_id AND id = v_entry.id;

  RETURN jsonb_build_object(
    'entry', to_jsonb(v_entry),
    'blocks', COALESCE((
      SELECT jsonb_agg(to_jsonb(block_row) ORDER BY block_row.sort_order, block_row.id)
      FROM public.workspace_external_project_blocks block_row
      WHERE block_row.ws_id = p_ws_id AND block_row.entry_id = v_entry.id
    ), '[]'::jsonb),
    'relations', COALESCE((
      SELECT jsonb_agg(to_jsonb(relation_row) ORDER BY relation_row.created_at, relation_row.id)
      FROM public.workspace_external_project_entry_relations relation_row
      WHERE relation_row.ws_id = p_ws_id AND relation_row.from_entry_id = v_entry.id
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_workspace_external_project_entry_bundle(p_ws_id uuid, p_actor_id uuid, p_entry jsonb, p_blocks jsonb, p_relations jsonb, p_entry_id uuid, p_expected_updated_at timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_workspace_external_project_entry_bundle(p_ws_id uuid, p_actor_id uuid, p_entry jsonb, p_blocks jsonb, p_relations jsonb, p_entry_id uuid, p_expected_updated_at timestamp with time zone) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.upsert_workspace_external_project_entry_bundle(p_ws_id uuid, p_actor_id uuid, p_entry jsonb, p_blocks jsonb, p_relations jsonb, p_entry_id uuid, p_expected_updated_at timestamp with time zone) TO "service_role";
DO $restore_enum_locals$
DECLARE routine record; definition text;
BEGIN
  FOR routine IN
    SELECT oid, prosrc FROM pg_catalog.pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = ANY (ARRAY[
        'get_dau_count',
        'get_wau_count',
        'get_mau_count',
        'get_engagement_metrics_over_time',
        'get_active_sessions_count',
        'get_auth_session_statistics',
        'get_sessions_by_device',
        'get_auth_provider_stats',
        'get_sign_ins_by_provider',
        'get_user_growth_stats',
        'get_user_growth_comparison',
        'get_workspace_statistics',
        'get_workspace_member_distribution',
        'get_recent_actions_summary',
        'get_action_frequency_by_hour',
        'get_recent_audit_logs',
        'get_user_activity_cohorts',
        'get_retention_rate',
        'get_activity_heatmap',
        'get_power_users',
        'get_feature_adoption',
        'admin_list_ai_credit_transactions',
        'get_ai_credit_usage_summary',
        'get_or_create_credit_balance'
      ])
  LOOP
    definition := pg_catalog.pg_get_functiondef(routine.oid);
    definition := pg_catalog.replace(definition,
      E'SELECT private.require_service_role_for_admin_analytics();\n', '');
    definition := pg_catalog.replace(definition,
      E'\n  PERFORM private.require_service_role_for_admin_analytics();', '');
    EXECUTE pg_catalog.regexp_replace(definition,
      '(v_tier[[:space:]]+)public\.workspace_product_tier;',
      '\1workspace_product_tier;', 'gi');
  END LOOP;
END;
$restore_enum_locals$;
DROP FUNCTION private.require_service_role_for_admin_analytics();
COMMIT;
