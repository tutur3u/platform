DROP TRIGGER IF EXISTS sync_member_roles_from_invite_tr ON public.workspace_members;

create schema if not exists "pgmq";

CREATE OR REPLACE FUNCTION public.has_workspace_secret(ws_id uuid, secret_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.workspace_secrets ws
    WHERE ws.ws_id = has_workspace_secret.ws_id
      AND ws.name = has_workspace_secret.secret_name
      AND ws.value = 'true'
      AND public.is_org_member(auth.uid(), has_workspace_secret.ws_id)
  );
END;
$function$;

--
-- Migrate legacy role-based policies to permission-based policies
--
-- This migration replaces role-based RLS policies (using get_user_role()) with
-- permission-based policies (using has_workspace_permission()).
--
-- Key changes:
-- 1. All policies now check for specific permissions instead of roles
-- 2. Each DROP policy is immediately followed by its corresponding CREATE policy
-- 3. Missing policies have been added (e.g., workspace_invites SELECT, INSERT, DELETE)
-- 4. Policy names follow consistent naming: "Allow [permission holders] to [action]"
--
-- Permission mappings:
-- - 'manage_workspace_roles' -> Role and permission management
-- - 'manage_workspace_members' -> Member and invite management
-- - 'manage_workspace_settings' -> Workspace configuration
-- - 'manage_workspace_secrets' -> Platform-level secrets (root workspace only)
--

-- timezones
drop policy "Allow modification for platform admins" on "public"."timezones";

create policy "Allow platform admins to modify"
on "public"."timezones"
as permissive
for all
to authenticated
using (public.has_workspace_permission('00000000-0000-0000-0000-000000000000'::uuid, auth.uid(), 'manage_workspace_roles'::text))
with check (public.has_workspace_permission('00000000-0000-0000-0000-000000000000'::uuid, auth.uid(), 'manage_workspace_roles'::text));

-- workspace_education_access_requests
drop policy "Enable platform admins to update requests" on "public"."workspace_education_access_requests";

create policy "Allow platform admins to manage requests"
on "public"."workspace_education_access_requests"
as permissive
for all
to authenticated
using (public.has_workspace_permission('00000000-0000-0000-0000-000000000000'::uuid, auth.uid(), 'manage_workspace_roles'::text))
with check (public.has_workspace_permission('00000000-0000-0000-0000-000000000000'::uuid, auth.uid(), 'manage_workspace_roles'::text));

drop policy "Enable workspace owners to create requests" on "public"."workspace_education_access_requests";

create policy "Allow workspace role manager to create requests"
on "public"."workspace_education_access_requests"
as permissive
for insert
to authenticated
with check (public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_roles'::text));

drop policy "Enable workspace owners to view own requests" on "public"."workspace_education_access_requests";

create policy "Allow workspace role manager to view requests"
on "public"."workspace_education_access_requests"
as permissive
for select
to authenticated
using (public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_roles'::text));

-- workspace_subscription_products
drop policy "only allow admin to insert" on "public"."workspace_subscription_products";

create policy "Allow platform admins to insert products"
on "public"."workspace_subscription_products"
as permissive
for insert
to authenticated
with check (
  public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000000'::uuid,
    auth.uid(),
    'manage_workspace_roles'
  )
);

-- workspace_members
-- INSERT policy
drop policy if exists "Enable insert with personal workspace constraints" on "public"."workspace_members";

create policy "Allow workspace managers to insert members with constraints"
on "public"."workspace_members"
as permissive
for insert
to authenticated
with check (
  user_id = auth.uid()
  AND (
    -- Allow if it's a non-personal workspace OR user is workspace owner
    (
      (is_personal_workspace(ws_id) = false)
      OR is_workspace_owner(ws_id, auth.uid())
    )
    AND (
      -- Allow if user is invited
      is_member_invited(auth.uid(), ws_id)
      OR (
        EXISTS (
          SELECT 1 FROM workspace_email_invites wei
          WHERE lower(wei.email) = lower(auth.email())
        )
      )
    )
    -- SPECIAL CASE: Allow workspace creator to add themselves as first member
    OR (
      EXISTS (
        SELECT 1 FROM workspaces w
        WHERE w.id = ws_id
        AND w.creator_id = auth.uid()
        AND NOT EXISTS (
          SELECT 1 FROM workspace_members wm
          WHERE wm.ws_id = ws_id
        )
      )
    )
  )
);

-- UPDATE policy
drop policy "Allow update for workspace members" on "public"."workspace_members";

create policy "Allow workspace managers to update members"
on "public"."workspace_members"
as permissive
for update
to authenticated
using (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
  OR (auth.uid() = user_id)
)
with check (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
  OR (auth.uid() = user_id)
);

-- DELETE policy
drop policy "Enable delete for organization members" on "public"."workspace_members";

create policy "Allow workspace managers to delete members"
on "public"."workspace_members"
as permissive
for delete
to authenticated
using (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
  OR (auth.uid() = user_id)
);

-- workspaces
-- UPDATE policy
drop policy if exists "Allow update for workspace owners or admins" on "public"."workspaces";

create policy "Allow workspace settings managers to update"
on "public"."workspaces"
as permissive
for update
to authenticated
using (
  id <> '00000000-0000-0000-0000-000000000000'::uuid
  AND public.has_workspace_permission(id, auth.uid(), 'manage_workspace_settings')
)
with check (
  id <> '00000000-0000-0000-0000-000000000000'::uuid
  AND public.has_workspace_permission(id, auth.uid(), 'manage_workspace_settings')
);

-- DELETE policy
drop policy if exists "Allow delete for workspace owners" on "public"."workspaces";
drop policy if exists "Enable delete for workspace owners" on "public"."workspaces";

create policy "Allow workspace settings managers to delete"
on "public"."workspaces"
as permissive
for delete
to authenticated
using (
  id <> '00000000-0000-0000-0000-000000000000'::uuid
  AND NOT public.has_workspace_secret(id, 'PREVENT_WORKSPACE_DELETION')
  AND public.has_workspace_permission(id, auth.uid(), 'manage_workspace_settings')
);

-- workspace_invites
-- Note: Previously had 4 policies (SELECT, INSERT, UPDATE, DELETE)
-- Migrating all to permission-based model for consistency

-- SELECT policy
drop policy if exists "Enable read access for organization members and current user" on "public"."workspace_invites";

create policy "Allow members to view invites"
on "public"."workspace_invites"
as permissive
for select
to authenticated
using (
  (auth.uid() = user_id)
  OR is_org_member(auth.uid(), ws_id)
);

-- INSERT policy
drop policy if exists "Enable insert for workspace members" on "public"."workspace_invites";

create policy "Allow member managers to insert invites"
on "public"."workspace_invites"
as permissive
for insert
to authenticated
with check (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
  AND is_org_member(auth.uid(), ws_id)
  AND (NOT is_org_member(user_id, ws_id))
  AND (NOT EXISTS (
    SELECT 1 FROM workspace_secrets wss
    WHERE wss.ws_id = workspace_invites.ws_id
    AND wss.name = 'DISABLE_INVITE'
  ))
);

-- UPDATE policy
drop policy if exists "Allow update for workspace members" on "public"."workspace_invites";

create policy "Allow member managers to update invites"
on "public"."workspace_invites"
as permissive
for update
to authenticated
using (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
  AND is_org_member(auth.uid(), ws_id)
)
with check (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
  AND is_org_member(auth.uid(), ws_id)
);

-- DELETE policy
drop policy if exists "Enable delete for organization members and current user" on "public"."workspace_invites";

create policy "Allow member managers to delete invites"
on "public"."workspace_invites"
as permissive
for delete
to authenticated
using (
  (auth.uid() = user_id)
  OR (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
    AND is_org_member(auth.uid(), ws_id)
  )
);

-- workspace_email_invites
-- INSERT policy
drop policy if exists "Enable insert for organization members and current user" on "public"."workspace_email_invites";

create policy "Allow member managers to send email invites"
on "public"."workspace_email_invites"
as permissive
for insert
to authenticated
with check (
  is_member_invited(auth.uid(), ws_id)
  OR (
    is_org_member(auth.uid(), ws_id)
    AND public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
  )
  OR (
    EXISTS (
      SELECT 1 FROM workspace_email_invites wei
      WHERE lower(wei.email) = lower(auth.email())
    )
  )
);

-- UPDATE policy
drop policy if exists "Allow update for workspace members" on "public"."workspace_email_invites";

create policy "Allow member managers to update email invites"
on "public"."workspace_email_invites"
as permissive
for update
to authenticated
using (
  (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
    AND is_org_member(auth.uid(), ws_id)
  )
)
with check (
  (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
    AND is_org_member(auth.uid(), ws_id)
  )
);

-- workspace_roles
drop policy if exists "Allow workspace owners to have full permissions" on "public"."workspace_roles";

create policy "Allow role managers to manage roles"
on "public"."workspace_roles"
as permissive
for all
to authenticated
using (public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_roles'))
with check (public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_roles'));

-- workspace_role_members
drop policy if exists "Allow workspace owners to have full permissions" on "public"."workspace_role_members";

create policy "Allow role managers to manage role members"
on "public"."workspace_role_members"
as permissive
for all
to authenticated
using (
  public.has_workspace_permission(
    (SELECT wr.ws_id FROM workspace_roles wr WHERE wr.id = workspace_role_members.role_id),
    auth.uid(),
    'manage_workspace_roles'
  )
)
with check (
  public.has_workspace_permission(
    (SELECT wr.ws_id FROM workspace_roles wr WHERE wr.id = workspace_role_members.role_id),
    auth.uid(),
    'manage_workspace_roles'
  )
);

-- workspace_role_permissions
drop policy if exists "Allow workspace owners to have full permissions" on "public"."workspace_role_permissions";

create policy "Allow role managers to manage permissions"
on "public"."workspace_role_permissions"
as permissive
for all
to authenticated
using (public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_roles'))
with check (public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_roles'));

-- workspace_default_permissions
-- Note: Multiple legacy policies being replaced with single permission-based policy
drop policy if exists "Allow workspace owners to manage default permissions" on "public"."workspace_default_permissions";
drop policy if exists "Allow workspace owners to have full permissions" on "public"."workspace_default_permissions";

create policy "Allow role managers to manage default permissions"
on "public"."workspace_default_permissions"
as permissive
for all
to authenticated
using (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_roles')
  OR (
    EXISTS (
      SELECT wss.id FROM workspaces wss
      WHERE wss.id = workspace_default_permissions.ws_id
      AND wss.creator_id = auth.uid()
    )
  )
)
with check (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_roles')
  OR (
    EXISTS (
      SELECT wss.id FROM workspaces wss
      WHERE wss.id = workspace_default_permissions.ws_id
      AND wss.creator_id = auth.uid()
    )
  )
);

-- workspace_configs
drop policy if exists "Enable all access for workspace admins" on "public"."workspace_configs";

create policy "Allow settings managers to manage configs"
on "public"."workspace_configs"
as permissive
for all
to authenticated
using (public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_settings'))
with check (public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_settings'));

-- workspace_user_group_tags
drop policy if exists "Enable all access for workspace admins" on "public"."workspace_user_group_tags";

create policy "Allow settings managers to manage user group tags"
on "public"."workspace_user_group_tags"
as permissive
for all
to authenticated
using (public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_settings'))
with check (public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_settings'));

-- workspace_user_group_tag_groups
drop policy if exists "Enable all access for workspace admins" on "public"."workspace_user_group_tag_groups";

create policy "Allow settings managers to manage tag groups"
on "public"."workspace_user_group_tag_groups"
as permissive
for all
to authenticated
using (
  EXISTS (
    SELECT 1 FROM workspace_user_groups wug
    WHERE wug.id = workspace_user_group_tag_groups.group_id
    AND public.has_workspace_permission(wug.ws_id, auth.uid(), 'manage_workspace_settings')
  )
)
with check (
  EXISTS (
    SELECT 1 FROM workspace_user_groups wug
    WHERE wug.id = workspace_user_group_tag_groups.group_id
    AND public.has_workspace_permission(wug.ws_id, auth.uid(), 'manage_workspace_settings')
  )
);

-- external_user_monthly_reports
drop policy if exists "Allow all access for workspace admins" on "public"."external_user_monthly_reports";

create policy "Allow member managers to manage reports"
on "public"."external_user_monthly_reports"
as permissive
for all
to authenticated
using (
  public.has_workspace_permission(
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_reports.user_id),
    auth.uid(),
    'manage_workspace_members'
  )
)
with check (
  public.has_workspace_permission(
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_reports.user_id),
    auth.uid(),
    'manage_workspace_members'
  )
);

-- external_user_monthly_report_logs
drop policy if exists "Allow all access for workspace admins" on "public"."external_user_monthly_report_logs";

create policy "Allow member managers to manage report logs"
on "public"."external_user_monthly_report_logs"
as permissive
for all
to authenticated
using (
  public.has_workspace_permission(
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_report_logs.user_id),
    auth.uid(),
    'manage_workspace_members'
  )
)
with check (
  public.has_workspace_permission(
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_report_logs.user_id),
    auth.uid(),
    'manage_workspace_members'
  )
);

-- workspace_user_status_changes
-- Note: Multiple legacy policies being replaced with single permission-based policy
drop policy if exists "Allow all access for workspace admins" on "public"."workspace_user_status_changes";
drop policy if exists "Enable all access for root platform admins" on "public"."workspace_user_status_changes";

create policy "Allow member managers to manage status changes"
on "public"."workspace_user_status_changes"
as permissive
for all
to authenticated
using (public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members'))
with check (public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members'));

-- workspace_secrets
drop policy if exists "Enable all access for root workspace admin and owner" on "public"."workspace_secrets";

create policy "Allow platform admins to manage workspace secrets"
on "public"."workspace_secrets"
as permissive
for all
to authenticated
using (
  public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000000'::uuid,
    auth.uid(),
    'manage_workspace_secrets'
  )
  AND is_org_member(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
)
with check (
  public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000000'::uuid,
    auth.uid(),
    'manage_workspace_secrets'
  )
  AND is_org_member(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
);

--
-- Drop legacy role column and related constraints
--

alter table "public"."workspace_members" drop constraint "workspace_members_role_fkey";

drop view if exists "public"."workspace_members_and_invites";

drop view if exists "public"."audit_logs";

drop view if exists "public"."workspace_users_with_groups";

alter table "public"."workspace_members" drop column "role";

--
-- Drop obsolete functions and triggers that depend on the role column
--

drop trigger if exists check_workspace_owners_trigger on public.workspace_members;
drop function if exists public.get_user_role(uuid, uuid);
drop function if exists public.check_workspace_owners();
drop function if exists public.has_other_owner(uuid, uuid);

--
-- Recreate views without role column references
--

create or replace view "public"."audit_logs" as  SELECT id,
    table_name,
    record_id,
    old_record_id,
    op,
    ts,
    record,
    old_record,
    auth_role,
    auth_uid,
    COALESCE(audit.get_ws_id((table_name)::text, record), audit.get_ws_id((table_name)::text, old_record)) AS ws_id
   FROM audit.record_version audit_log
  WHERE (EXISTS ( SELECT 1
           FROM public.workspace_members wm
          WHERE (((wm.ws_id = audit.get_ws_id((audit_log.table_name)::text, audit_log.record)) OR (wm.ws_id = audit.get_ws_id((audit_log.table_name)::text, audit_log.old_record))) AND ((auth.uid() IS NULL) OR (wm.user_id = auth.uid())))))
  ORDER BY ts DESC;


create or replace view "public"."workspace_users_with_groups" as  SELECT id,
    full_name,
    email,
    phone,
    birthday,
    gender,
    ethnicity,
    guardian,
    address,
    national_id,
    note,
    ws_id,
    created_at,
    balance,
    avatar_url,
    display_name,
    archived,
    archived_until,
    created_by,
    updated_at,
    updated_by,
    ( SELECT json_agg(wug.id) AS json_agg
           FROM (public.workspace_user_groups wug
             JOIN public.workspace_user_groups_users wugu ON ((wug.id = wugu.group_id)))
          WHERE (wugu.user_id = wu.id)) AS groups,
    ( SELECT count(*) AS count
           FROM (public.workspace_user_groups wug
             JOIN public.workspace_user_groups_users wugu ON ((wug.id = wugu.group_id)))
          WHERE (wugu.user_id = wu.id)) AS group_count,
    ( SELECT json_agg(linked_users.*) AS json_agg
           FROM ( SELECT DISTINCT ON (wulu.platform_user_id) wulu.platform_user_id,
                    u.display_name
                   FROM ((public.workspace_user_linked_users wulu
                     JOIN public.users u ON ((wulu.platform_user_id = u.id)))
                     JOIN public.workspace_members wm ON ((u.id = wm.user_id)))
                  WHERE ((wm.user_id = u.id) AND (wulu.virtual_user_id = wu.id))) linked_users) AS linked_users
   FROM public.workspace_users wu;

--
-- Update personal workspace creation function
--

CREATE OR REPLACE FUNCTION public.create_personal_workspace_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  new_workspace_id uuid;
BEGIN
  -- Check if user already has a personal workspace
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspaces
    WHERE creator_id = NEW.id
    AND personal = true
  ) THEN
    -- Create a personal workspace for the new user
    -- Note: Using SECURITY DEFINER allows bypassing RLS for initial workspace creation
    INSERT INTO public.workspaces (
      name,
      creator_id,
      personal
    ) VALUES (
      'Personal', -- Default name, can be customized by user later
      NEW.id,
      true
    )
    RETURNING id INTO new_workspace_id;

    -- Add the user as a member of their personal workspace
    INSERT INTO public.workspace_members (
      ws_id,
      user_id
    ) VALUES (
      new_workspace_id,
      NEW.id
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail user creation
    RAISE WARNING 'Failed to create personal workspace for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;

--
-- Function to create personal workspaces for existing users who don't have one
--

CREATE OR REPLACE FUNCTION public.create_missing_personal_workspaces()
RETURNS TABLE(user_id uuid, workspace_id uuid, success boolean, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_record RECORD;
  new_ws_id uuid;
BEGIN
  -- Loop through users who don't have a personal workspace
  FOR user_record IN
    SELECT u.id
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.creator_id = u.id
      AND w.personal = true
    )
    AND u.deleted_at IS NULL
  LOOP
    BEGIN
      -- Create personal workspace
      INSERT INTO public.workspaces (name, creator_id, personal)
      VALUES ('Personal', user_record.id, true)
      RETURNING id INTO new_ws_id;

      -- Add user as member
      INSERT INTO public.workspace_members (ws_id, user_id)
      VALUES (new_ws_id, user_record.id);

      -- Return success
      user_id := user_record.id;
      workspace_id := new_ws_id;
      success := true;
      error_message := NULL;
      RETURN NEXT;

    EXCEPTION WHEN OTHERS THEN
      -- Return failure
      user_id := user_record.id;
      workspace_id := NULL;
      success := false;
      error_message := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

-- Grant execute to authenticated users (for admin purposes)
GRANT EXECUTE ON FUNCTION public.create_missing_personal_workspaces() TO authenticated;

--
-- Drop role columns from workspace invite tables
--

alter table if exists "public"."workspace_members" drop column if exists "role_title";

-- workspace_invites
alter table if exists "public"."workspace_invites" drop constraint if exists "workspace_invites_role_fkey";
alter table if exists "public"."workspace_invites" drop column if exists "role";
alter table if exists "public"."workspace_invites" drop column if exists "role_title";

-- workspace_email_invites
alter table if exists "public"."workspace_email_invites" drop constraint if exists "workspace_email_invites_role_fkey";
alter table if exists "public"."workspace_email_invites" drop column if exists "role";
alter table if exists "public"."workspace_email_invites" drop column if exists "role_title";

-- workspace_invite_links (need to drop dependent view first)
drop view if exists "public"."workspace_invite_links_with_stats";

alter table if exists "public"."workspace_invite_links" drop constraint if exists "workspace_invite_links_role_fkey";
alter table if exists "public"."workspace_invite_links" drop column if exists "role";
alter table if exists "public"."workspace_invite_links" drop column if exists "role_title";

-- Recreate workspace_invite_links_with_stats view without role columns
create or replace view "public"."workspace_invite_links_with_stats" as
SELECT
  wil.id,
  wil.ws_id,
  wil.code,
  wil.creator_id,
  wil.max_uses,
  wil.expires_at,
  wil.created_at,
  wil.updated_at,
  COUNT(wilu.id) as current_uses,
  CASE
    WHEN wil.expires_at IS NOT NULL AND wil.expires_at < now() THEN true
    ELSE false
  END as is_expired,
  CASE
    WHEN wil.max_uses IS NOT NULL AND COUNT(wilu.id) >= wil.max_uses THEN true
    ELSE false
  END as is_full
FROM workspace_invite_links wil
LEFT JOIN workspace_invite_link_uses wilu ON wil.id = wilu.invite_link_id
GROUP BY wil.id, wil.ws_id, wil.code, wil.creator_id, wil.max_uses, wil.expires_at, wil.created_at, wil.updated_at;

--
-- Drop workspace_default_roles table
--

drop table if exists public.workspace_default_roles;

--
-- Recreate workspace_members_and_invites view without role columns
--

create or replace view "public"."workspace_members_and_invites" as
SELECT
  wi.ws_id,
  u.id,
  u.handle,
  NULL::text AS email,
  u.display_name,
  u.avatar_url,
  COALESCE(wm.created_at, wi.created_at) AS created_at,
  (wm.user_id IS NULL) AS pending
FROM workspace_invites wi
LEFT JOIN users u ON wi.user_id = u.id
LEFT JOIN workspace_members wm ON wi.user_id = wm.user_id AND wi.ws_id = wm.ws_id

UNION ALL

SELECT
  wei.ws_id,
  NULL::uuid AS id,
  NULL::text AS handle,
  wei.email,
  NULL::text AS display_name,
  NULL::text AS avatar_url,
  wei.created_at,
  true AS pending
FROM workspace_email_invites wei;
