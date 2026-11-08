-- Rollback: return the ownership guard to its 20261028152419 behavior: the
-- guard trusts every non-API role again, the personal flip no longer needs a
-- single member, the transfer RPC writes its own audit row and service_role
-- may execute it again. This reopens creator_id changes by SECURITY DEFINER
-- paths running under a user JWT and personal flips on multi-member
-- workspaces. Not a migration: release-authority approval only.
-- Kept on purpose: the audit table keeps its extra columns and rows, and its
-- ws_id foreign key is not restored (rows may reference deleted workspaces).
begin;
drop trigger if exists workspaces_audit_creator_change on public.workspaces;
drop function if exists private.audit_workspace_creator_change();

create or replace function public.guard_workspace_protected_columns()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.creator_id is distinct from old.creator_id then
    raise exception 'Workspace ownership can only change through an ownership transfer'
      using errcode = '42501';
  end if;

  if new.personal is distinct from old.personal
    and (auth.uid() is null or auth.uid() is distinct from old.creator_id)
  then
    raise exception 'Only the workspace creator can change personal status'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.transfer_workspace_ownership(
  p_ws_id uuid,
  p_new_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_workspace record;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_ws_id is null or p_new_owner_id is null then
    raise exception 'Workspace and new owner are required' using errcode = '22023';
  end if;

  select w.id, w.creator_id, w.personal
  into v_workspace
  from public.workspaces w
  where w.id = p_ws_id
    and w.deleted is not true
  for update;

  if not found or v_workspace.creator_id is distinct from v_actor then
    raise exception 'Only the workspace creator can transfer ownership'
      using errcode = '42501';
  end if;

  if p_ws_id = '00000000-0000-0000-0000-000000000000'::uuid
    or v_workspace.personal is true
  then
    raise exception 'This workspace cannot be transferred' using errcode = '22023';
  end if;

  if p_new_owner_id = v_actor then
    raise exception 'New owner must differ from the current owner' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.workspace_members m
    where m.ws_id = p_ws_id
      and m.user_id = p_new_owner_id
      and m.type = 'MEMBER'::public.workspace_member_type
  ) then
    raise exception 'New owner must be a workspace member' using errcode = '22023';
  end if;

  update public.workspaces
  set creator_id = p_new_owner_id
  where id = p_ws_id;

  insert into public.workspace_ownership_transfers (
    ws_id,
    previous_creator_id,
    new_creator_id,
    actor_id
  )
  values (p_ws_id, v_workspace.creator_id, p_new_owner_id, v_actor);
end;
$$;

grant execute on function public.transfer_workspace_ownership(uuid, uuid)
to service_role;
commit;
