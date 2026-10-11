-- A private, lazily populated cache. File mutations invalidate it transactionally.
CREATE TABLE private.external_project_storage_analytics_cache (
  ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  adapter text NOT NULL,
  payload jsonb,
  computed_at timestamptz,
  PRIMARY KEY (ws_id, adapter)
);
ALTER TABLE private.external_project_storage_analytics_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.external_project_storage_analytics_cache FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.invalidate_external_project_storage_analytics()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  workspace_path text;
  paths text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.bucket_id = 'workspaces' THEN
    paths := array_append(paths, split_part(OLD.name, '/', 1));
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.bucket_id = 'workspaces' THEN
    paths := array_append(paths, split_part(NEW.name, '/', 1));
  END IF;
  FOR workspace_path IN SELECT DISTINCT p FROM unnest(paths) p ORDER BY p LOOP
    -- Share the refresh lock even when the first cache row has not been inserted.
    PERFORM pg_advisory_xact_lock(hashtextextended(workspace_path, 73007));
    IF workspace_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      UPDATE private.external_project_storage_analytics_cache
        SET payload = NULL, computed_at = NULL WHERE ws_id = workspace_path::uuid;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.invalidate_external_project_storage_analytics() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER invalidate_external_project_storage_analytics
AFTER INSERT OR UPDATE OR DELETE ON storage.objects
FOR EACH ROW EXECUTE FUNCTION private.invalidate_external_project_storage_analytics();

CREATE FUNCTION public.get_external_project_storage_analytics(p_ws_id uuid, p_adapter text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  cached jsonb;
  prefix text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_adapter IS NULL OR p_adapter !~ '^[a-z0-9][a-z0-9_-]{0,79}$' THEN
    RAISE EXCEPTION 'Invalid adapter' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_ws_id::text, 73007));
  SELECT payload INTO cached FROM private.external_project_storage_analytics_cache
    WHERE ws_id = p_ws_id AND adapter = p_adapter
      AND computed_at > clock_timestamp() - interval '5 minutes';
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  prefix := p_ws_id::text || '/external-projects/' || p_adapter || '/';
  WITH scanned AS MATERIALIZED (
    SELECT name, updated_at,
      CASE WHEN metadata->>'size' ~ '^[0-9]+([.][0-9]+)?$'
        THEN (metadata->>'size')::numeric ELSE 0 END AS size
    FROM storage.objects o
    WHERE bucket_id = 'workspaces' AND name COLLATE "C" >= prefix COLLATE "C"
      AND name COLLATE "C" < (left(prefix, -1) || '0') COLLATE "C"
      AND to_jsonb(o)->>'archived_at' IS NULL
    ORDER BY name COLLATE "C" LIMIT 1001
  ), capped AS MATERIALIZED (
    SELECT * FROM scanned ORDER BY name COLLATE "C" LIMIT 1000
  ), files AS MATERIALIZED (
    SELECT * FROM capped WHERE regexp_replace(name, '^.*/', '') <> '.emptyFolderPlaceholder'
  )
  SELECT jsonb_build_object(
    'totalSize', coalesce((SELECT sum(size) FROM files), 0),
    'fileCount', (SELECT count(*) FROM files),
    'scannedObjectLimit', 1000,
    'truncated', (SELECT count(*) > 1000 FROM scanned),
    'largestFile', (SELECT jsonb_build_object('name', regexp_replace(name, '^.*/', ''), 'size', size,
      'createdAt', coalesce(to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ''))
      FROM files ORDER BY size DESC, name COLLATE "C" LIMIT 1),
    'smallestFile', (SELECT jsonb_build_object('name', regexp_replace(name, '^.*/', ''), 'size', size,
      'createdAt', coalesce(to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ''))
      FROM files ORDER BY size, name COLLATE "C" LIMIT 1)
  ) INTO cached;
  INSERT INTO private.external_project_storage_analytics_cache(ws_id, adapter, payload, computed_at)
    VALUES(p_ws_id, p_adapter, cached, clock_timestamp())
    ON CONFLICT (ws_id, adapter) DO UPDATE SET payload = EXCLUDED.payload, computed_at = EXCLUDED.computed_at;
  RETURN cached;
END;
$$;
REVOKE ALL ON FUNCTION public.get_external_project_storage_analytics(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_external_project_storage_analytics(uuid, text) TO service_role;
