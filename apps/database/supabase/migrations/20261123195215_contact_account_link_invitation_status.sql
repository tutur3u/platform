-- Read-only invitation state for the operator who manages a contact's account
-- link. It applies the same membership and permission check as the invite and
-- revoke functions, and returns only state, identifiers, and timestamps.
create function private.read_contact_account_link_invitation(
  p_ws_id uuid, p_contact_id uuid, p_actor_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_event private.contact_account_link_audit%rowtype;
  v_invitation private.contact_account_link_invitations%rowtype;
  v_state text;
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

  if not exists (
    select 1 from public.workspace_users
    where id = p_contact_id and ws_id = p_ws_id
  ) then
    return null;
  end if;

  -- Issuing an invitation writes the superseded invitation's revocation first,
  -- so the identity order is the event order within one statement.
  select * into v_event
  from private.contact_account_link_audit
  where ws_id = p_ws_id and contact_id = p_contact_id
    and (
      outcome = 'unlinked'
      or (
        invitation_id is not null
        and outcome in ('invited', 'linked', 'declined', 'revoked', 'ineligible')
      )
    )
  order by id desc
  limit 1;

  if v_event.id is null or v_event.outcome = 'unlinked' then
    return null;
  end if;

  select * into v_invitation
  from private.contact_account_link_invitations
  where id = v_event.invitation_id and ws_id = p_ws_id
    and contact_id = p_contact_id;

  v_state := case v_event.outcome
    when 'invited' then
      case
        when v_invitation.consumed_at is null
          and v_invitation.expires_at > statement_timestamp() then 'pending'
        else 'expired'
      end
    when 'linked' then 'accepted'
    when 'declined' then 'declined'
    when 'revoked' then 'cancelled'
    else 'ineligible'
  end;

  return jsonb_build_object(
    'state', v_state,
    'invitationId', case when v_state = 'pending' then v_event.invitation_id end,
    'accountId', v_event.account_id,
    'updatedAt', v_event.occurred_at,
    'expiresAt', case
      when v_state in ('pending', 'expired') then v_invitation.expires_at
    end
  );
end;
$$;

revoke all on function private.read_contact_account_link_invitation(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.read_contact_account_link_invitation(uuid, uuid, uuid)
  to service_role;
