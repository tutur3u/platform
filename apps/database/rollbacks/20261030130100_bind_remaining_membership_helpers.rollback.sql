BEGIN;
SET LOCAL lock_timeout = '5s';
-- Rollback order: 131100 -> 131000 -> 130950 -> 130100 -> 130000.
-- Drop the composite FK in 131000 before the quarantine rollback (130950).

-- Restore definition from 20250813082227_add_personal_workspace.sql
create or replace function public.is_workspace_owner(p_ws_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.workspaces w
    where w.id = p_ws_id
      and w.creator_id = p_user_id
  );
$function$;

-- Restore definition from 20240501095759_remote_schema.sql
CREATE OR REPLACE FUNCTION public.is_member_invited(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$SELECT EXISTS (
  SELECT 1
  FROM workspace_invites wsi
  WHERE wsi.ws_id = _org_id
  AND wsi.user_id = _user_id
);
$function$
;

-- Restore definition from 20251003144301_create_realtime_chat_tables.sql
CREATE OR REPLACE FUNCTION public.user_is_in_channel(p_channel_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_chat_participants
        WHERE channel_id = p_channel_id
        AND user_id = p_user_id
    );
$$;

-- Restore definition from 20260510143500_add_hive_research_engine.sql
create or replace function public.is_hive_member(_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.hive_members hm
    where hm.user_id = _user_id
      and hm.enabled = true
  );
$$;

-- Restore definition from 20260510143500_add_hive_research_engine.sql
create or replace function public.is_hive_platform_admin(_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_user_roles pur
    where pur.user_id = _user_id
      and pur.enabled = true
      and pur.allow_role_management = true
  );
$$;

-- Restore definition from 20260210110000_auto_create_personal_workspaces.sql
CREATE OR REPLACE FUNCTION public.can_create_workspace(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT (
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
  );
$function$;

-- Restore definition from 20251017171252_remove_workspace_creation_limits.sql
create or replace function public.count_user_workspaces(user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from public.workspaces
  where creator_id = user_id
    and deleted = false;
$$;

-- Restore definition from 20250813082227_add_personal_workspace.sql
create or replace function public.is_personal_workspace(p_ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(
    (select personal from public.workspaces where id = p_ws_id),
    false
  );
$function$;

-- Restore definition from 20260622090000_add_shareable_task_plans.sql
create or replace function public.is_task_plan_intended_workspace(
  p_plan_id uuid,
  p_ws_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.task_plan_workspaces tpw
    where tpw.plan_id = p_plan_id
      and tpw.ws_id = p_ws_id
  );
$$;


-- Restore subsequent function setting from 20261024023000_harden_definer_function_grants.sql
alter function public.is_member_invited(uuid, uuid) set search_path = public;
-- Restore subsequent function setting from 20261024023000_harden_definer_function_grants.sql
alter function public.user_is_in_channel(uuid, uuid) set search_path = '';
-- Analytics functions retain the restricted forward ACL.

-- Preserve the matching forward migration ACLs while restoring prior bodies.
REVOKE ALL ON FUNCTION public.is_workspace_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.is_workspace_owner(uuid,uuid) review=https://github.com/tutur3u/platform/pull/7359
GRANT EXECUTE ON FUNCTION public.is_workspace_owner(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_member_invited(uuid, uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.is_member_invited(uuid,uuid) review=https://github.com/tutur3u/platform/pull/7359
GRANT EXECUTE ON FUNCTION public.is_member_invited(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_is_in_channel(uuid, uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.user_is_in_channel(uuid,uuid) review=https://github.com/tutur3u/platform/pull/7359
GRANT EXECUTE ON FUNCTION public.user_is_in_channel(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_hive_member(uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.is_hive_member(uuid) review=https://github.com/tutur3u/platform/pull/7359
GRANT EXECUTE ON FUNCTION public.is_hive_member(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_hive_platform_admin(uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.is_hive_platform_admin(uuid) review=https://github.com/tutur3u/platform/pull/7359
GRANT EXECUTE ON FUNCTION public.is_hive_platform_admin(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_create_workspace(uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.can_create_workspace(uuid) review=https://github.com/tutur3u/platform/pull/7359
GRANT EXECUTE ON FUNCTION public.can_create_workspace(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.count_user_workspaces(uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.count_user_workspaces(uuid) review=https://github.com/tutur3u/platform/pull/7359
GRANT EXECUTE ON FUNCTION public.count_user_workspaces(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_personal_workspace(uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.is_personal_workspace(uuid) review=https://github.com/tutur3u/platform/pull/7359
GRANT EXECUTE ON FUNCTION public.is_personal_workspace(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_task_plan_intended_workspace(uuid, uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.is_task_plan_intended_workspace(uuid,uuid) review=https://github.com/tutur3u/platform/pull/7359
GRANT EXECUTE ON FUNCTION public.is_task_plan_intended_workspace(uuid, uuid) TO authenticated, service_role;

COMMIT;
