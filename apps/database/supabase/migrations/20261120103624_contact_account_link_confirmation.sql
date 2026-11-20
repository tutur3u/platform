drop policy if exists "Allow insert for workspace users"
  on public.workspace_user_linked_users;
revoke insert, update, delete, truncate
  on public.workspace_user_linked_users from public, anon, authenticated;

create table private.contact_account_link_invitations (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.workspace_users(id) on delete cascade,
  account_id uuid not null references public.users(id) on delete cascade,
  invited_by uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '1 day'),
  consumed_at timestamptz
);

create table private.contact_account_link_audit (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  ws_id uuid not null,
  contact_id uuid not null,
  actor_id uuid not null,
  invitation_id uuid,
  account_id uuid,
  invited_by uuid,
  outcome text not null check (
    outcome in ('invited', 'confirmation_required', 'ineligible', 'linked', 'declined', 'revoked')
  )
);

alter table private.contact_account_link_invitations enable row level security;
alter table private.contact_account_link_audit enable row level security;
revoke all on table private.contact_account_link_invitations,
  private.contact_account_link_audit from public, anon, authenticated, service_role;

-- Only the API's verified request actor is passed to this function. No
-- authorization or candidate selection relies on mutable contact fields.
create function private.invite_contact_account_link(
  p_ws_id uuid, p_contact_id uuid, p_account_id uuid, p_actor_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_invitation_id uuid;
begin
  if not exists (
    select 1 from public.workspace_members
    where ws_id = p_ws_id and user_id = p_actor_id
  ) or not (
    public.has_workspace_permission(p_ws_id, p_actor_id, 'update_users')
    and public.has_workspace_permission(p_ws_id, p_actor_id, 'view_users_private_info')
    and public.has_workspace_permission(p_ws_id, p_actor_id, 'view_users_public_info')
  ) then
    raise exception 'Insufficient permissions' using errcode = '42501';
  end if;

  perform 1 from public.workspace_users
  where id = p_contact_id and ws_id = p_ws_id for update;
  if not found or not exists (
    select 1 from public.workspace_members
    where ws_id = p_ws_id and user_id = p_account_id
  ) or exists (
    select 1 from public.workspace_user_linked_users
    where ws_id = p_ws_id
      and (platform_user_id = p_account_id or virtual_user_id = p_contact_id)
  ) then
    insert into private.contact_account_link_audit
      (ws_id, contact_id, actor_id, outcome)
    values (p_ws_id, p_contact_id, p_actor_id, 'ineligible');
    return null;
  end if;

  with superseded as (
    update private.contact_account_link_invitations
    set consumed_at = statement_timestamp()
    where ws_id = p_ws_id and contact_id = p_contact_id and consumed_at is null
    returning id, account_id, invited_by
  )
  insert into private.contact_account_link_audit
    (ws_id, contact_id, actor_id, outcome, invitation_id, account_id, invited_by)
  select p_ws_id, p_contact_id, p_actor_id, 'revoked', id, account_id, invited_by
  from superseded;

  insert into private.contact_account_link_invitations
    (ws_id, contact_id, account_id, invited_by)
  values (p_ws_id, p_contact_id, p_account_id, p_actor_id)
  returning id into v_invitation_id;

  insert into private.contact_account_link_audit
    (ws_id, contact_id, actor_id, outcome, invitation_id, account_id, invited_by)
  values (p_ws_id, p_contact_id, p_actor_id, 'invited', v_invitation_id, p_account_id, p_actor_id);
  return v_invitation_id;
end;
$$;

create function private.confirm_contact_account_link(
  p_ws_id uuid, p_contact_id uuid, p_invitation_id uuid, p_actor_id uuid
) returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_invitation private.contact_account_link_invitations%rowtype;
  v_outcome text := 'confirmation_required';
begin
  -- Use the same contact-then-invitation lock order on every write path.
  perform 1 from public.workspace_users
  where id = p_contact_id and ws_id = p_ws_id for update;
  if found then
    select * into v_invitation
    from private.contact_account_link_invitations
    where id = p_invitation_id and ws_id = p_ws_id
      and contact_id = p_contact_id and account_id = p_actor_id
      and expires_at > statement_timestamp() and consumed_at is null
    for update;
  end if;

  if v_invitation.id is not null then
    v_outcome := 'ineligible';
    perform 1 from public.workspace_members
    where ws_id = p_ws_id and user_id = p_actor_id for share;
    if found and exists (
      select 1 from public.workspace_members
      where ws_id = p_ws_id and user_id = v_invitation.invited_by
    ) and (
      public.has_workspace_permission(p_ws_id, v_invitation.invited_by, 'update_users')
      and public.has_workspace_permission(p_ws_id, v_invitation.invited_by, 'view_users_private_info')
      and public.has_workspace_permission(p_ws_id, v_invitation.invited_by, 'view_users_public_info')
    ) and not exists (
      select 1 from public.workspace_user_linked_users
      where ws_id = p_ws_id and virtual_user_id = p_contact_id
    ) then
      insert into public.workspace_user_linked_users
        (ws_id, virtual_user_id, platform_user_id)
      values (p_ws_id, p_contact_id, p_actor_id)
      on conflict (platform_user_id, ws_id) do nothing;
      if found then
        v_outcome := 'linked';
      end if;
    end if;

    update private.contact_account_link_invitations
    set consumed_at = statement_timestamp() where id = v_invitation.id;
  end if;

  insert into private.contact_account_link_audit
    (ws_id, contact_id, actor_id, outcome, invitation_id, account_id, invited_by)
  values (p_ws_id, p_contact_id, p_actor_id, v_outcome,
    v_invitation.id, v_invitation.account_id, v_invitation.invited_by);
  return v_outcome;
end;
$$;

create function private.preview_contact_account_link(
  p_ws_id uuid, p_contact_id uuid, p_invitation_id uuid, p_actor_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'workspace', w.name,
    'contact', nullif(btrim(c.display_name), ''),
    'inviter', nullif(btrim(u.display_name), ''),
    'expiresAt', i.expires_at
  )
  from private.contact_account_link_invitations i
  join public.workspace_users c on c.id = i.contact_id and c.ws_id = i.ws_id
  join public.workspaces w on w.id = i.ws_id
  join public.users u on u.id = i.invited_by
  join public.workspace_members m on m.ws_id = i.ws_id and m.user_id = i.account_id
  join public.workspace_members inviter_membership
    on inviter_membership.ws_id = i.ws_id and inviter_membership.user_id = i.invited_by
  where i.id = p_invitation_id and i.ws_id = p_ws_id
    and i.contact_id = p_contact_id and i.account_id = p_actor_id
    and i.expires_at > statement_timestamp() and i.consumed_at is null
    and public.has_workspace_permission(i.ws_id, i.invited_by, 'update_users')
    and public.has_workspace_permission(i.ws_id, i.invited_by, 'view_users_private_info')
    and public.has_workspace_permission(i.ws_id, i.invited_by, 'view_users_public_info')
    and not exists (
      select 1 from public.workspace_user_linked_users links
      where links.ws_id = i.ws_id
        and (links.virtual_user_id = i.contact_id or links.platform_user_id = i.account_id)
    );
$$;

create function private.finish_contact_account_link_invitation(
  p_ws_id uuid, p_contact_id uuid, p_invitation_id uuid, p_actor_id uuid, p_action text
) returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_invitation private.contact_account_link_invitations%rowtype;
  v_outcome text;
begin
  if p_action not in ('decline', 'revoke') or p_action is null then
    raise exception 'Invalid action' using errcode = '22023';
  end if;
  if p_action = 'revoke' and (
    not exists (
      select 1 from public.workspace_members
      where ws_id = p_ws_id and user_id = p_actor_id
    ) or not (
      public.has_workspace_permission(p_ws_id, p_actor_id, 'update_users')
      and public.has_workspace_permission(p_ws_id, p_actor_id, 'view_users_private_info')
      and public.has_workspace_permission(p_ws_id, p_actor_id, 'view_users_public_info')
    )
  ) then
    raise exception 'Insufficient permissions' using errcode = '42501';
  end if;

  perform 1 from public.workspace_users
  where id = p_contact_id and ws_id = p_ws_id for update;
  if not found then return 'confirmation_required'; end if;

  update private.contact_account_link_invitations
  set consumed_at = statement_timestamp()
  where ws_id = p_ws_id and contact_id = p_contact_id
    and (id = p_invitation_id or (p_action = 'revoke' and p_invitation_id is null))
    and consumed_at is null and expires_at > statement_timestamp()
    and (
      p_action = 'revoke' or (
        account_id = p_actor_id and exists (
          select 1 from public.workspace_members
          where ws_id = p_ws_id and user_id = p_actor_id
        )
      )
    )
  returning * into v_invitation;

  if not found then return 'confirmation_required'; end if;
  v_outcome := case when p_action = 'decline' then 'declined' else 'revoked' end;
  insert into private.contact_account_link_audit
    (ws_id, contact_id, actor_id, outcome, invitation_id, account_id, invited_by)
  values (p_ws_id, p_contact_id, p_actor_id, v_outcome,
    v_invitation.id, v_invitation.account_id, v_invitation.invited_by);
  return v_outcome;
end;
$$;

revoke all on function private.invite_contact_account_link(uuid, uuid, uuid, uuid),
  private.confirm_contact_account_link(uuid, uuid, uuid, uuid),
  private.preview_contact_account_link(uuid, uuid, uuid, uuid),
  private.finish_contact_account_link_invitation(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function private.invite_contact_account_link(uuid, uuid, uuid, uuid),
  private.confirm_contact_account_link(uuid, uuid, uuid, uuid),
  private.preview_contact_account_link(uuid, uuid, uuid, uuid),
  private.finish_contact_account_link_invitation(uuid, uuid, uuid, uuid, text)
  to service_role;

-- Membership provisioning creates a fresh profile for the account.
-- Assigning an existing contact requires recipient consent.
create or replace function public.ensure_workspace_user_link(
  target_user_id uuid,
  target_ws_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  existing_virtual_user_id uuid;
  new_workspace_user_id uuid;
  user_display_name text;
  user_email text;
  user_exists boolean := false;
begin
  -- Serialize trigger, backfill, and request-time repair calls for one member.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(':', target_ws_id::text, target_user_id::text),
      81428
    )
  );

  -- Authenticated callers may repair only their own link. A membership trigger
  -- is already guarded by the workspace_members insert policy, while service
  -- role maintenance has no auth.uid().
  if caller_id is not null
    and caller_id <> target_user_id
    and pg_catalog.pg_trigger_depth() = 0
  then
    raise exception 'Cannot repair another user workspace link'
      using errcode = '42501';
  end if;

  select link.virtual_user_id
  into existing_virtual_user_id
  from public.workspace_user_linked_users link
  where link.platform_user_id = target_user_id
    and link.ws_id = target_ws_id;

  if existing_virtual_user_id is not null then
    return existing_virtual_user_id;
  end if;

  if not exists (
    select 1
    from public.workspace_members member
    where member.user_id = target_user_id
      and member.ws_id = target_ws_id
  ) then
    raise exception 'User % is not a member of workspace %',
      target_user_id,
      target_ws_id;
  end if;

  select
    true,
    coalesce(
      nullif(pg_catalog.btrim(app_user.display_name), ''),
      nullif(pg_catalog.btrim(private_details.full_name), ''),
      nullif(pg_catalog.btrim(app_user.handle), ''),
      nullif(pg_catalog.btrim(private_details.email), ''),
      pg_catalog.format('User %s', pg_catalog.left(target_user_id::text, 8))
    ),
    nullif(
      pg_catalog.btrim(coalesce(private_details.email, '')),
      ''
    )
  into user_exists, user_display_name, user_email
  from public.users app_user
  left join public.user_private_details private_details
    on private_details.user_id = app_user.id
  where app_user.id = target_user_id;

  if user_exists is not true then
    raise exception 'User % not found', target_user_id;
  end if;

  new_workspace_user_id := extensions.gen_random_uuid();
  insert into public.workspace_users (id, ws_id, display_name, email)
  values (new_workspace_user_id, target_ws_id, user_display_name, coalesce(user_email, ''));

  insert into public.workspace_user_linked_users (
    platform_user_id,
    virtual_user_id,
    ws_id
  )
  values (target_user_id, new_workspace_user_id, target_ws_id);

  return new_workspace_user_id;
end;
$$;


create or replace function public.consolidate_workspace_user_links(
  target_ws_id uuid default null
)
returns table (
  platform_user_id uuid,
  ws_id uuid,
  action text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  rec record;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'consolidate_workspace_user_links requires the service role'
      using errcode = '42501';
  end if;

  for rec in
    select wm.user_id, wm.ws_id
    from public.workspace_members wm
    where (target_ws_id is null or wm.ws_id = target_ws_id)
      and not exists (
        select 1
        from public.workspace_user_linked_users wul
        where wul.platform_user_id = wm.user_id
          and wul.ws_id = wm.ws_id
      )
  loop
    perform public.ensure_workspace_user_link(rec.user_id, rec.ws_id);
    action := 'created';

    platform_user_id := rec.user_id;
    ws_id := rec.ws_id;
    return next;
  end loop;
end;
$$;


drop trigger if exists consolidate_user_group_manager_link
  on public.workspace_user_groups_users;
drop trigger if exists consolidate_user_group_manager_links_on_membership
  on public.workspace_members;
drop function if exists private.consolidate_user_group_manager_link_trigger();
drop function if exists private.consolidate_user_group_manager_links_on_membership();
drop function if exists private.consolidate_user_group_manager_link(uuid, uuid);
