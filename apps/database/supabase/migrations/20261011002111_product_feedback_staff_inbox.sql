-- Requires the root-approved canonical employee registry/finalization migration
-- chain AND 20261007160000_product_feedback_intake.sql in the source union.
-- Never create/adopt an employee registry here. No activation or quota change.
DO $$ BEGIN
  IF pg_catalog.to_regclass('private.infrastructure_employees') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Canonical employee registry dependency unavailable';
  END IF;
END $$;

ALTER TABLE private.product_feedback_reports
  ADD COLUMN status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX product_feedback_inbox_order ON private.product_feedback_reports
  (created_at DESC,id DESC) WHERE archived_at IS NULL;
CREATE INDEX product_feedback_inbox_status_order ON private.product_feedback_reports
  (status,created_at DESC,id DESC) WHERE archived_at IS NULL;
CREATE INDEX product_feedback_archive_order ON private.product_feedback_reports
  (created_at DESC,id DESC) WHERE archived_at IS NOT NULL;

CREATE FUNCTION private.assert_product_feedback_staff(p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET statement_timeout = '3s' SET lock_timeout = '500ms' AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Service role required';
  END IF;
  IF pg_catalog.to_regclass('private.infrastructure_employees') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='PT503', MESSAGE='Feedback unavailable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u JOIN private.infrastructure_employees e ON e.user_id=u.id
    WHERE u.id=p_actor AND e.staff_email=pg_catalog.lower(u.email)
      AND e.lifecycle_state='active'
      AND u.email ~* '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@tuturuuu\.com$'
      AND u.email_confirmed_at IS NOT NULL
      AND (u.banned_until IS NULL OR u.banned_until <= pg_catalog.now())
      AND u.raw_app_meta_data->'employee_onboarding'='true'::jsonb
  ) THEN
    RAISE EXCEPTION USING ERRCODE='PT403', MESSAGE='Feedback forbidden';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.assert_product_feedback_staff(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.list_product_feedback_staff(
  p_actor uuid,p_view text,p_status text,p_query text,p_limit integer,
  p_before timestamptz,p_before_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET statement_timeout = '3s' SET lock_timeout = '500ms' AS $$
DECLARE result jsonb; literal_query text;
BEGIN
  PERFORM private.assert_product_feedback_staff(p_actor);
  IF p_view IS NULL OR p_view NOT IN ('inbox','resolved','archive','all')
    OR (p_status IS NOT NULL AND (p_status NOT IN ('open','resolved') OR p_view NOT IN ('archive','all')))
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 50
    OR p_query IS NULL OR p_query <> pg_catalog.btrim(p_query)
    OR pg_catalog.char_length(p_query) > 160 OR p_query ~ '[[:cntrl:]]'
    OR ((p_before IS NULL) <> (p_before_id IS NULL))
    OR (p_before IS NOT NULL AND NOT pg_catalog.isfinite(p_before)) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid feedback query';
  END IF;
  literal_query := '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(p_query,
    E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_') || '%';
  SELECT pg_catalog.jsonb_build_object('items',COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('id',r.id,'title',r.title,'createdAt',r.created_at,
      'status',r.status,'archivedAt',r.archived_at,'revision',r.revision)
    ORDER BY r.created_at DESC,r.id DESC),'[]'::jsonb)) INTO result
  FROM (
    SELECT id,title,created_at,status,archived_at,revision FROM private.product_feedback_reports
    WHERE (p_view='all' OR (p_view='archive' AND archived_at IS NOT NULL)
      OR (p_view='inbox' AND archived_at IS NULL AND status='open')
      OR (p_view='resolved' AND archived_at IS NULL AND status='resolved'))
      AND (p_status IS NULL OR status=p_status)
      AND (p_query='' OR title ILIKE literal_query ESCAPE E'\\')
      AND (p_before IS NULL OR (created_at,id) < (p_before,p_before_id))
    ORDER BY created_at DESC,id DESC LIMIT p_limit+1
  ) r;
  RETURN result;
END;
$$;
CREATE FUNCTION public.get_product_feedback_staff(p_actor uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET statement_timeout = '3s' SET lock_timeout = '500ms' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM private.assert_product_feedback_staff(p_actor);
  IF p_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid feedback id';
  END IF;
  SELECT pg_catalog.jsonb_build_object('id',id,'title',title,'createdAt',created_at,
    'status',status,'archivedAt',archived_at,'revision',revision,'body',body,
    'updatedAt',updated_at,'capabilities',pg_catalog.jsonb_build_object('canManage',false))
    INTO result FROM private.product_feedback_reports WHERE id=p_id;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.list_product_feedback_staff(uuid,text,text,text,integer,timestamptz,uuid),
  public.get_product_feedback_staff(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_product_feedback_staff(uuid,text,text,text,integer,timestamptz,uuid),
  public.get_product_feedback_staff(uuid,uuid) TO service_role;
-- No authenticated private schema/table grants, role grants, writes or transitions.
