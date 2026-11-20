create table private.contact_account_provisioned_profiles (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  account_id uuid not null references public.users(id) on delete cascade,
  profile_id uuid not null unique references public.workspace_users(id) on delete cascade,
  primary key (ws_id, account_id)
);
alter table private.contact_account_provisioned_profiles enable row level security;
revoke all on table private.contact_account_provisioned_profiles
  from public, anon, authenticated, service_role;

alter table private.contact_account_link_invitations
  add column replacement_profile_id uuid;

create or replace function public.ensure_workspace_user_link(
  target_user_id uuid,
  target_ws_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
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

  insert into private.contact_account_provisioned_profiles
    (ws_id, account_id, profile_id)
  values (target_ws_id, target_user_id, new_workspace_user_id)
  on conflict (ws_id, account_id) do update
  set profile_id = excluded.profile_id;

  return new_workspace_user_id;
end;
$$;

revoke all on function public.ensure_workspace_user_link(uuid, uuid)
  from public, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.ensure_workspace_user_link(uuid,uuid) review=contacts-consent-acl
grant execute on function public.ensure_workspace_user_link(uuid, uuid)
  to authenticated, service_role;

create unique index contact_account_link_invitations_pending_contact_uidx
  on private.contact_account_link_invitations (contact_id)
  where consumed_at is null;

create or replace function private.invite_contact_account_link(
  p_ws_id uuid, p_contact_id uuid, p_account_id uuid, p_actor_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_invitation_id uuid;
  v_linked_profile uuid;
  v_replaceable_profile uuid;
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
  if not found then return null; end if;

  select links.virtual_user_id, provisioned.profile_id
  into v_linked_profile, v_replaceable_profile
  from public.workspace_user_linked_users links
  left join private.contact_account_provisioned_profiles provisioned
    on provisioned.ws_id = links.ws_id
    and provisioned.account_id = links.platform_user_id
    and provisioned.profile_id = links.virtual_user_id
  where links.ws_id = p_ws_id and links.platform_user_id = p_account_id;

  if not exists (
    select 1 from public.workspace_members
    where ws_id = p_ws_id and user_id = p_account_id
  ) or exists (
    select 1 from public.workspace_user_linked_users
    where ws_id = p_ws_id
      and virtual_user_id = p_contact_id
  ) or (
    v_linked_profile is not null and (
      v_replaceable_profile is null or not coalesce(
        public.has_workspace_permission(p_ws_id, p_actor_id, 'delete_users'),
        false
      )
    )
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
    (ws_id, contact_id, account_id, invited_by, replacement_profile_id)
  values (p_ws_id, p_contact_id, p_account_id, p_actor_id, v_replaceable_profile)
  returning id into v_invitation_id;

  insert into private.contact_account_link_audit
    (ws_id, contact_id, actor_id, outcome, invitation_id, account_id, invited_by)
  values (p_ws_id, p_contact_id, p_actor_id, 'invited', v_invitation_id, p_account_id, p_actor_id);
  return v_invitation_id;
end;
$$;

create or replace function private.confirm_contact_account_link(
  p_ws_id uuid, p_contact_id uuid, p_invitation_id uuid, p_actor_id uuid
) returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_invitation private.contact_account_link_invitations%rowtype;
  v_outcome text := 'confirmation_required';
  v_merge_result jsonb;
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
      if v_invitation.replacement_profile_id is null then
        insert into public.workspace_user_linked_users
          (ws_id, virtual_user_id, platform_user_id)
        values (p_ws_id, p_contact_id, p_actor_id)
        on conflict (platform_user_id, ws_id) do nothing;
        if found then v_outcome := 'linked'; end if;
      else
        perform 1
        from public.workspace_users source
        join public.workspace_user_linked_users links
          on links.virtual_user_id = source.id and links.ws_id = source.ws_id
        join private.contact_account_provisioned_profiles provisioned
          on provisioned.ws_id = links.ws_id
          and provisioned.account_id = links.platform_user_id
          and provisioned.profile_id = links.virtual_user_id
        where source.ws_id = p_ws_id
          and source.id = v_invitation.replacement_profile_id
          and links.platform_user_id = p_actor_id
        for update of source, links, provisioned;

        if found then
          v_merge_result := private.merge_workspace_users_for_actor(
            v_invitation.replacement_profile_id, p_contact_id, p_ws_id,
            v_invitation.invited_by
          );
          if (v_merge_result->>'success')::boolean then
            if not exists (
              select 1 from public.workspace_user_linked_users
              where ws_id = p_ws_id and virtual_user_id = p_contact_id
                and platform_user_id = p_actor_id
            ) then
              raise exception 'Consented contact merge did not transfer the account';
            end if;
            v_outcome := 'linked';
          end if;
        end if;
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

create or replace function private.preview_contact_account_link(
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
    'expiresAt', i.expires_at,
    'replacesProvisionedProfile', i.replacement_profile_id is not null
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
        and links.virtual_user_id = i.contact_id
    )
    and (
      (i.replacement_profile_id is null and not exists (
        select 1 from public.workspace_user_linked_users links
        where links.ws_id = i.ws_id and links.platform_user_id = i.account_id
      ))
      or (
        i.replacement_profile_id is not null
        and public.has_workspace_permission(i.ws_id, i.invited_by, 'delete_users')
        and exists (
          select 1
          from public.workspace_user_linked_users links
          join private.contact_account_provisioned_profiles provisioned
            on provisioned.ws_id = links.ws_id
            and provisioned.account_id = links.platform_user_id
            and provisioned.profile_id = links.virtual_user_id
          where links.ws_id = i.ws_id and links.platform_user_id = i.account_id
            and links.virtual_user_id = i.replacement_profile_id
        )
      )
    );
$$;

revoke all on function private.invite_contact_account_link(uuid, uuid, uuid, uuid),
  private.confirm_contact_account_link(uuid, uuid, uuid, uuid),
  private.preview_contact_account_link(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.invite_contact_account_link(uuid, uuid, uuid, uuid),
  private.confirm_contact_account_link(uuid, uuid, uuid, uuid),
  private.preview_contact_account_link(uuid, uuid, uuid, uuid)
  to service_role;
