-- Align database RLS on public.workspace_whiteboards and
-- public.time_tracking_categories with the least-privilege API rules:
--
-- 1. public.workspace_whiteboards
--    - SELECT / INSERT: active workspace members (`type = 'MEMBER'` via
--      `public.is_org_member`). Guests and non-members are denied.
--    - UPDATE: active workspace members may save canvas snapshots (`snapshot`,
--      `updated_at`); mutating metadata (`title`, `description`, `archived_at`,
--      `thumbnail_url`) requires being the board creator or holding
--      `manage_workspace_settings`. Immutable ownership/scope columns (`id`,
--      `ws_id`, `creator_id`, `created_at`) cannot be altered by `authenticated`.
--    - DELETE: active workspace member who is the board creator or holds
--      `manage_workspace_settings`.
--
-- 2. public.time_tracking_categories
--    - SELECT / INSERT: active workspace members (`public.is_org_member`).
--      Guests and non-members are denied.
--    - UPDATE / DELETE: active workspace members holding
--      `manage_workspace_settings` or `manage_time_tracking_requests`.

-- ============================================================================
-- 1. public.workspace_whiteboards
-- ============================================================================

revoke all on table public.workspace_whiteboards from anon;

drop policy if exists "Workspace members can read whiteboards"
  on public.workspace_whiteboards;
drop policy if exists "Workspace members can insert whiteboards"
  on public.workspace_whiteboards;
drop policy if exists "Workspace members can update whiteboards"
  on public.workspace_whiteboards;
drop policy if exists "Workspace members can delete whiteboards"
  on public.workspace_whiteboards;

create policy "Workspace members can read whiteboards"
  on public.workspace_whiteboards
  as permissive
  for select
  to authenticated
  using (public.is_org_member(auth.uid(), ws_id));

create policy "Workspace members can insert whiteboards"
  on public.workspace_whiteboards
  as permissive
  for insert
  to authenticated
  with check (
    creator_id = auth.uid()
    and public.is_org_member(auth.uid(), ws_id)
  );

create policy "Workspace members can update whiteboards"
  on public.workspace_whiteboards
  as permissive
  for update
  to authenticated
  using (public.is_org_member(auth.uid(), ws_id))
  with check (public.is_org_member(auth.uid(), ws_id));

create policy "Creators or workspace managers can delete whiteboards"
  on public.workspace_whiteboards
  as permissive
  for delete
  to authenticated
  using (
    public.is_org_member(auth.uid(), ws_id)
    and (
      creator_id = auth.uid()
      or public.has_workspace_permission(
        ws_id,
        auth.uid(),
        'manage_workspace_settings'
      )
    )
  );

-- tuturuuu: no-grant (trigger)
create or replace function private.enforce_workspace_whiteboard_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
begin
  if v_role in ('authenticated', 'anon')
    or (v_role is distinct from 'service_role' and auth.uid() is not null)
  then
    if new.id is distinct from old.id
      or new.ws_id is distinct from old.ws_id
      or new.creator_id is distinct from old.creator_id
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Immutable whiteboard columns cannot be modified'
        using errcode = '42501';
    end if;

    if new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.archived_at is distinct from old.archived_at
      or new.thumbnail_url is distinct from old.thumbnail_url
    then
      if old.creator_id is distinct from auth.uid()
        and not public.has_workspace_permission(
          old.ws_id,
          auth.uid(),
          'manage_workspace_settings'
        )
      then
        raise exception 'Only the board creator or workspace managers can edit whiteboard metadata or archive status'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_workspace_whiteboard_update() from public, anon, authenticated, service_role;

drop trigger if exists enforce_workspace_whiteboard_update_trigger
  on public.workspace_whiteboards;

create trigger enforce_workspace_whiteboard_update_trigger
  before update on public.workspace_whiteboards
  for each row
  execute function private.enforce_workspace_whiteboard_update();

-- ============================================================================
-- 2. public.time_tracking_categories
-- ============================================================================

revoke all on table public.time_tracking_categories from anon;

drop policy if exists "Allow workspace members to read categories"
  on public.time_tracking_categories;
drop policy if exists "Allow workspace members to manage categories"
  on public.time_tracking_categories;

create policy "Workspace members can read time tracking categories"
  on public.time_tracking_categories
  as permissive
  for select
  to authenticated
  using (public.is_org_member(auth.uid(), ws_id));

create policy "Workspace members can insert time tracking categories"
  on public.time_tracking_categories
  as permissive
  for insert
  to authenticated
  with check (public.is_org_member(auth.uid(), ws_id));

create policy "Workspace managers can update time tracking categories"
  on public.time_tracking_categories
  as permissive
  for update
  to authenticated
  using (
    public.is_org_member(auth.uid(), ws_id)
    and (
      public.has_workspace_permission(
        ws_id,
        auth.uid(),
        'manage_workspace_settings'
      )
      or public.has_workspace_permission(
        ws_id,
        auth.uid(),
        'manage_time_tracking_requests'
      )
    )
  )
  with check (
    public.is_org_member(auth.uid(), ws_id)
    and (
      public.has_workspace_permission(
        ws_id,
        auth.uid(),
        'manage_workspace_settings'
      )
      or public.has_workspace_permission(
        ws_id,
        auth.uid(),
        'manage_time_tracking_requests'
      )
    )
  );

create policy "Workspace managers can delete time tracking categories"
  on public.time_tracking_categories
  as permissive
  for delete
  to authenticated
  using (
    public.is_org_member(auth.uid(), ws_id)
    and (
      public.has_workspace_permission(
        ws_id,
        auth.uid(),
        'manage_workspace_settings'
      )
      or public.has_workspace_permission(
        ws_id,
        auth.uid(),
        'manage_time_tracking_requests'
      )
    )
  );
