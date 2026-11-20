alter table private.contact_account_link_audit
  drop constraint contact_account_link_audit_outcome_check,
  add constraint contact_account_link_audit_outcome_check check (
    outcome in (
      'invited', 'confirmation_required', 'ineligible', 'linked',
      'declined', 'revoked', 'unlinked'
    )
  );

create function private.unlink_contact_account_link(
  p_ws_id uuid, p_contact_id uuid, p_account_id uuid, p_actor_id uuid
) returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_actor_id is null or (
    p_actor_id is distinct from p_account_id and not (
      exists (
        select 1 from public.workspace_members
        where ws_id = p_ws_id and user_id = p_actor_id
      ) and coalesce(
        public.has_workspace_permission(p_ws_id, p_actor_id, 'update_users'),
        false
      )
    )
  ) then
    raise exception 'Insufficient permissions' using errcode = '42501';
  end if;

  perform 1 from public.workspace_users
  where id = p_contact_id and ws_id = p_ws_id for update;
  if not found then return 'ineligible'; end if;

  delete from public.workspace_user_linked_users
  where ws_id = p_ws_id and virtual_user_id = p_contact_id
    and platform_user_id = p_account_id;
  if not found then return 'ineligible'; end if;

  insert into private.contact_account_link_audit
    (ws_id, contact_id, actor_id, account_id, outcome)
  values (p_ws_id, p_contact_id, p_actor_id, p_account_id, 'unlinked');
  return 'unlinked';
end;
$$;

revoke all on function private.unlink_contact_account_link(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.unlink_contact_account_link(uuid, uuid, uuid, uuid)
  to service_role;
