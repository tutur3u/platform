-- Match 113002 caller scope; preserve original scalar queries and trigger scope.
BEGIN;

create or replace function public.is_workspace_owner(p_ws_id uuid, p_user_id uuid)
returns boolean
LANGUAGE plpgsql
stable
security definer
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() = 0
    AND coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) IN ('anon', 'authenticated')
    AND (p_user_id IS DISTINCT FROM auth.uid())
  THEN
    RETURN false;
  END IF;

  RETURN (
exists (
    select 1
    from public.workspaces w
    where w.id = p_ws_id
      and w.creator_id = p_user_id
  )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_workspace_owner(uuid,uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.is_workspace_owner(uuid,uuid) review=SR-345-caller-bound
GRANT EXECUTE ON FUNCTION public.is_workspace_owner(uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_member_invited(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() = 0
    AND coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) IN ('anon', 'authenticated')
    AND (_user_id IS DISTINCT FROM auth.uid())
  THEN
    RETURN false;
  END IF;

  RETURN (
EXISTS (
  SELECT 1
  FROM public.workspace_invites wsi
  WHERE wsi.ws_id = _org_id
  AND wsi.user_id = _user_id
)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_member_invited(uuid,uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.is_member_invited(uuid,uuid) review=SR-345-caller-bound
GRANT EXECUTE ON FUNCTION public.is_member_invited(uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_is_in_channel(p_channel_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() = 0
    AND coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) IN ('anon', 'authenticated')
    AND (p_user_id IS DISTINCT FROM auth.uid())
  THEN
    RETURN false;
  END IF;

  RETURN (
EXISTS (
        SELECT 1
        FROM public.workspace_chat_participants
        WHERE channel_id = p_channel_id
        AND user_id = p_user_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.user_is_in_channel(uuid,uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.user_is_in_channel(uuid,uuid) review=SR-345-caller-bound
GRANT EXECUTE ON FUNCTION public.user_is_in_channel(uuid,uuid) TO authenticated, service_role;

create or replace function public.is_hive_member(_user_id uuid default auth.uid())
returns boolean
LANGUAGE plpgsql
security definer
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() = 0
    AND coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) IN ('anon', 'authenticated')
    AND (_user_id IS DISTINCT FROM auth.uid())
  THEN
    RETURN false;
  END IF;

  RETURN (
exists (
    select 1
    from public.hive_members hm
    where hm.user_id = _user_id
      and hm.enabled = true
  )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_hive_member(uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.is_hive_member(uuid) review=SR-345-caller-bound
GRANT EXECUTE ON FUNCTION public.is_hive_member(uuid) TO authenticated, service_role;

create or replace function public.is_hive_platform_admin(_user_id uuid default auth.uid())
returns boolean
LANGUAGE plpgsql
security definer
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() = 0
    AND coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) IN ('anon', 'authenticated')
    AND (_user_id IS DISTINCT FROM auth.uid())
  THEN
    RETURN false;
  END IF;

  RETURN (
exists (
    select 1
    from public.platform_user_roles pur
    where pur.user_id = _user_id
      and pur.enabled = true
      and pur.allow_role_management = true
  )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_hive_platform_admin(uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.is_hive_platform_admin(uuid) review=SR-345-caller-bound
GRANT EXECUTE ON FUNCTION public.is_hive_platform_admin(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_create_workspace(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() = 0
    AND coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) IN ('anon', 'authenticated')
    AND (p_user_id IS DISTINCT FROM auth.uid())
  THEN
    RETURN false;
  END IF;

  RETURN (
(
    EXISTS (
      SELECT 1
      FROM public.platform_user_roles pur
      WHERE pur.user_id = p_user_id
        AND pur.allow_workspace_creation = true
    )
  ) OR (
    (SELECT count(*)
     FROM public.workspaces
     WHERE creator_id = p_user_id AND deleted = false) < 10
  )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_create_workspace(uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.can_create_workspace(uuid) review=SR-345-caller-bound
GRANT EXECUTE ON FUNCTION public.can_create_workspace(uuid) TO authenticated, service_role;

create or replace function public.count_user_workspaces(user_id uuid)
returns bigint
LANGUAGE plpgsql
stable
security definer
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() = 0
    AND coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) IN ('anon', 'authenticated')
    AND (user_id IS DISTINCT FROM auth.uid())
  THEN
    RETURN 0;
  END IF;

  RETURN (
SELECT count(*)
  from public.workspaces
  where creator_id = user_id
    and deleted = false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.count_user_workspaces(uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.count_user_workspaces(uuid) review=SR-345-caller-bound
GRANT EXECUTE ON FUNCTION public.count_user_workspaces(uuid) TO authenticated, service_role;

create or replace function public.is_personal_workspace(p_ws_id uuid)
returns boolean
LANGUAGE plpgsql
stable
security definer
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() = 0
    AND coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) IN ('anon', 'authenticated')
    AND (NOT public.is_org_member(auth.uid(), p_ws_id))
  THEN
    RETURN NULL;
  END IF;

  RETURN (
coalesce(
    (select personal from public.workspaces where id = p_ws_id),
    false
  )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_personal_workspace(uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.is_personal_workspace(uuid) review=SR-345-caller-bound
GRANT EXECUTE ON FUNCTION public.is_personal_workspace(uuid) TO authenticated, service_role;

create or replace function public.is_task_plan_intended_workspace(
  p_plan_id uuid,
  p_ws_id uuid
)
returns boolean
LANGUAGE plpgsql
stable
security definer
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() = 0
    AND coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) IN ('anon', 'authenticated')
    AND (NOT public.is_org_member(auth.uid(), p_ws_id))
  THEN
    RETURN false;
  END IF;

  RETURN (
exists (
    select 1
    from public.task_plan_workspaces tpw
    where tpw.plan_id = p_plan_id
      and tpw.ws_id = p_ws_id
  )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_task_plan_intended_workspace(uuid,uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.is_task_plan_intended_workspace(uuid,uuid) review=SR-345-caller-bound
GRANT EXECUTE ON FUNCTION public.is_task_plan_intended_workspace(uuid,uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_growth_stats(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_growth_stats(text) TO service_role;

REVOKE ALL ON FUNCTION public.get_user_growth_comparison() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_growth_comparison() TO service_role;

REVOKE ALL ON FUNCTION public.get_user_activity_cohorts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_activity_cohorts() TO service_role;

REVOKE ALL ON FUNCTION public.get_retention_rate(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_retention_rate(text) TO service_role;

COMMIT;
