CREATE FUNCTION public.publish_external_project_entry(
  p_ws_id uuid,
  p_canonical_project_id text,
  p_entry_id uuid,
  p_actor_id uuid,
  p_expected_updated_at timestamptz,
  p_published_at timestamptz,
  p_event_id uuid,
  p_asset_revisions jsonb,
  p_payload jsonb
)
RETURNS public.workspace_external_project_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET timezone = 'UTC'
AS $$
DECLARE
  v_entry public.workspace_external_project_entries;
  v_binding public.workspace_external_project_bindings;
  v_binding_matches boolean;
  v_asset_id uuid;
  v_verified_assets integer := 0;
  v_digest bytea;
BEGIN
  IF p_actor_id IS NULL OR (
    public.can_publish_workspace_external_projects(p_ws_id, p_actor_id)
      IS DISTINCT FROM true
    AND public.has_workspace_permission(
      '00000000-0000-0000-0000-000000000000'::uuid,
      p_actor_id,
      'manage_workspace_roles'
    ) IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'Not allowed to publish in this workspace' USING ERRCODE = '42501';
  END IF;

  SELECT b.* INTO v_binding
  FROM public.workspace_external_project_bindings AS b
  WHERE b.ws_id = p_ws_id
  FOR SHARE;
  IF FOUND THEN
    v_binding_matches := v_binding.is_enabled
      AND v_binding.canonical_project_id = p_canonical_project_id;
  ELSE
    SELECT count(*) = 2
      AND count(*) FILTER (WHERE name = 'EXTERNAL_PROJECT_ENABLED' AND value = 'true') = 1
      AND count(*) FILTER (WHERE name = 'EXTERNAL_PROJECT_CANONICAL_ID' AND value = p_canonical_project_id) = 1
    INTO v_binding_matches
    FROM (
      SELECT s.name, s.value FROM public.workspace_secrets AS s
      WHERE s.ws_id = p_ws_id
        AND s.name IN ('EXTERNAL_PROJECT_ENABLED', 'EXTERNAL_PROJECT_CANONICAL_ID')
      FOR SHARE
    ) AS legacy_binding;
  END IF;

  PERFORM 1 FROM public.canonical_external_projects AS p
  WHERE p.id = p_canonical_project_id AND p.is_active
  FOR SHARE;
  IF NOT FOUND OR v_binding_matches IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Workspace project binding changed' USING ERRCODE = 'PT409';
  END IF;

  IF jsonb_typeof(p_asset_revisions) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_payload->'profileData') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid publication snapshot' USING ERRCODE = '22023';
  END IF;

  UPDATE public.workspace_external_project_entries AS e
  SET status = 'published', published_at = p_published_at, updated_by = p_actor_id
  WHERE e.ws_id = p_ws_id AND e.id = p_entry_id
    AND e.updated_at = p_expected_updated_at
    AND p_published_at IS NOT NULL
    AND (e.published_at IS NULL OR p_published_at > e.published_at)
  RETURNING e.* INTO v_entry;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry changed before publication' USING ERRCODE = 'PT409';
  END IF;

  -- Hold each verified row through the proof and audit writes. A changed,
  -- missing or foreign revision aborts the entire publication.
  FOR v_asset_id IN
    SELECT a.id
    FROM jsonb_each(p_asset_revisions) AS proof(id, revision)
    JOIN public.workspace_external_project_assets AS a ON a.id = proof.id::uuid AND a.id::text = proof.id
    WHERE a.ws_id = p_ws_id AND a.entry_id = p_entry_id
      AND a.updated_at = (proof.revision->>'revision')::timestamptz
      AND a.updated_at <= p_published_at
      AND proof.revision->>'sha256' ~ '^[0-9a-f]{64}$'
    ORDER BY a.id
    FOR SHARE OF a
  LOOP
    v_verified_assets := v_verified_assets + 1;
  END LOOP;
  IF v_verified_assets <> (SELECT count(*) FROM jsonb_object_keys(p_asset_revisions)) THEN
    RAISE EXCEPTION 'Referenced media changed before publication' USING ERRCODE = 'PT422';
  END IF;

  -- Match assetPublicationProofId so existing delivery readers also find
  -- proofs written by this function.
  v_digest := sha256(convert_to(format('[%s,%s,%s,"publish",%s]',
    to_json(p_ws_id::text), to_json(p_canonical_project_id), to_json(p_entry_id::text),
    to_json((to_json(v_entry.published_at) #>> '{}') || '/' ||
      (to_json(v_entry.updated_at) #>> '{}'))), 'UTF8'));
  v_digest := set_byte(v_digest, 6, (get_byte(v_digest, 6) & 15) | 128);
  v_digest := set_byte(v_digest, 8, (get_byte(v_digest, 8) & 63) | 128);

  INSERT INTO private.external_project_asset_publication_proofs (
    id, ws_id, canonical_external_project_id, entry_id,
    published_at, entry_updated_at, asset_revisions
  ) VALUES (
    encode(substring(v_digest FROM 1 FOR 16), 'hex')::uuid,
    p_ws_id, p_canonical_project_id, p_entry_id,
    v_entry.published_at, v_entry.updated_at, p_asset_revisions
  );

  INSERT INTO public.workspace_external_project_publish_events (
    id, ws_id, canonical_external_project_id, entry_id, event_kind,
    visibility_scope, payload, profile_data, triggered_by
  ) VALUES (
    p_event_id, p_ws_id, p_canonical_project_id, p_entry_id, 'publish',
    'public', p_payload, p_payload->'profileData', p_actor_id
  );

  RETURN v_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_external_project_entry(
  uuid, text, uuid, uuid, timestamptz, timestamptz, uuid, jsonb, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_external_project_entry(
  uuid, text, uuid, uuid, timestamptz, timestamptz, uuid, jsonb, jsonb
) TO service_role;
