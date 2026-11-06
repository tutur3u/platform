-- Scope workspace invitations to the workspace they belong to.
--
-- Joining via an invite now requires an invite for the same workspace, matched
-- to the caller's user id or confirmed Auth email, and the membership type is
-- taken from that invite. Creating email invites requires membership plus
-- manage_workspace_members in the target workspace, and never for one's own
-- email. The creator bootstrap branch for empty workspaces keeps its meaning.
--
-- Neither policy reads its own table (or a table whose policies read it), so
-- client inserts are evaluated instead of failing with 42P17 recursion.

-- Returns the membership type granted by the caller's pending invite for
-- p_ws_id, or NULL. Bound to auth.uid(); reads auth.users for the confirmed
-- email, so a session email claim alone cannot redeem an email invite.
create or replace function public.current_user_workspace_invite_type(
  p_ws_id uuid
)
returns public.workspace_member_type
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    (
      select wi.type
      from public.workspace_invites wi
      where wi.ws_id = p_ws_id
        and wi.user_id = auth.uid()
    ),
    (
      select wei.type
      from auth.users u
      join public.workspace_email_invites wei
        on wei.ws_id = p_ws_id
       and lower(wei.email) = lower(u.email)
      where u.id = auth.uid()
        and u.email_confirmed_at is not null
        and lower(u.email) = lower(auth.email())
      order by (wei.type = 'MEMBER'::public.workspace_member_type)
      limit 1
    )
  );
$$;

revoke all on function public.current_user_workspace_invite_type(uuid) from public, anon;
grant execute on function public.current_user_workspace_invite_type(uuid) to authenticated, service_role;

-- Creator bootstrap check for an empty workspace, bound to auth.uid(). It runs
-- as definer so the membership policy no longer reads workspace_members or
-- workspaces under RLS, which made every client insert fail with 42P17.
create or replace function public.current_user_can_bootstrap_workspace(
  p_ws_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = p_ws_id
      and w.creator_id = auth.uid()
      and not exists (
        select 1
        from public.workspace_members wm
        where wm.ws_id = p_ws_id
      )
  );
$$;

revoke all on function public.current_user_can_bootstrap_workspace(uuid) from public, anon;
grant execute on function public.current_user_can_bootstrap_workspace(uuid) to authenticated, service_role;

-- Role assignment check for invites, bound to auth.uid(): the caller must
-- manage roles in p_ws_id and the role must belong to it. Reading
-- workspace_roles under RLS reaches workspaces, whose policies read the
-- invite tables, so the invite policy calls this instead.
create or replace function public.current_user_can_assign_workspace_role(
  p_ws_id uuid,
  p_role_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select public.has_workspace_permission(
      p_ws_id,
      auth.uid(),
      'manage_workspace_roles'::text
    )
    and exists (
      select 1
      from public.workspace_roles wr
      where wr.id = p_role_id
        and wr.ws_id = p_ws_id
    );
$$;

revoke all on function public.current_user_can_assign_workspace_role(uuid, uuid) from public, anon;
grant execute on function public.current_user_can_assign_workspace_role(uuid, uuid) to authenticated, service_role;

drop policy if exists "Allow workspace managers to insert members with constraints"
  on public.workspace_members;

create policy "Allow workspace managers to insert members with constraints"
on public.workspace_members
as permissive
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (
    (
      (
        public.is_personal_workspace(ws_id) = false
        or public.is_workspace_owner(ws_id, (select auth.uid()))
      )
      and type = public.current_user_workspace_invite_type(ws_id)
    )
    or public.current_user_can_bootstrap_workspace(ws_id)
  )
);

-- The member-only policy is a subset of this one once it requires the
-- invite permission, so it is dropped rather than narrowed.
drop policy if exists "Enable insert for workspace members"
  on public.workspace_email_invites;

drop policy if exists "Allow member managers to send email invites"
  on public.workspace_email_invites;

create policy "Allow member managers to send email invites"
on public.workspace_email_invites
as permissive
for insert
to authenticated
with check (
  public.is_org_member((select auth.uid()), ws_id)
  and public.has_workspace_permission(
    ws_id,
    (select auth.uid()),
    'manage_workspace_members'::text
  )
  and lower(email) is distinct from lower((select auth.email()))
  and public.workspace_has_available_seats(ws_id)
  and (
    role_id is null
    or (
      type = 'MEMBER'::public.workspace_member_type
      and public.current_user_can_assign_workspace_role(ws_id, role_id)
    )
  )
);
