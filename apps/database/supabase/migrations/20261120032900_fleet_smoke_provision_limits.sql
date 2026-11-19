-- tuturuuu: no-grant(trigger)
alter table private.fleet_smoke_operations add column purged_at timestamptz;

-- Tombstones retain the identity and workspace scope for all isolation guards.
create function private.guard_fleet_smoke_purge()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Fleet smoke ledger rows must be retained' using errcode = '42501';
  end if;
  if new.purged_at is not distinct from old.purged_at then return new; end if;
  if old.purged_at is not null or new.purged_at is null or old.state <> 'retired'
    or exists (select from auth.users where id = old.id)
    or exists (select from public.users where id = old.id)
    or exists (select from public.workspaces where id = old.workspace_id or creator_id = old.id)
  then
    raise exception 'Fleet smoke purge requires hard deletion of the retired identity and its workspace' using errcode = '42501';
  end if;
  new.purged_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.guard_fleet_smoke_purge() from public, anon, authenticated, service_role;
create trigger guard_fleet_smoke_purge before update of purged_at or delete on private.fleet_smoke_operations
for each row execute function private.guard_fleet_smoke_purge();

-- Never let the retained ledger limit prevent an existing identity from retiring.
create function private.guard_fleet_smoke_provision_limit()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(7903150601);
  if (select count(*) from private.fleet_smoke_operations where purged_at is null) >= 100
    or (select count(*) from private.fleet_smoke_operations
        where reserved_at >= clock_timestamp() - interval '24 hours') >= 5 then
    raise exception 'Fleet smoke provision limit reached' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_fleet_smoke_provision_limit() from public, anon, authenticated, service_role;
create trigger guard_fleet_smoke_provision_limit before insert on private.fleet_smoke_operations
for each row execute function private.guard_fleet_smoke_provision_limit();

-- Record the personal workspace even if enrollment stops before activation.
create function private.record_fleet_smoke_workspace()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  update private.fleet_smoke_operations set workspace_id = new.id
  where id = new.creator_id and state = 'pending' and workspace_id is null;
  return new;
end;
$$;
revoke all on function private.record_fleet_smoke_workspace() from public, anon, authenticated, service_role;
create trigger record_fleet_smoke_workspace after insert on public.workspaces
for each row execute function private.record_fleet_smoke_workspace();

update private.fleet_smoke_operations o set workspace_id = w.id
from public.workspaces w
where o.id = w.creator_id and w.personal and o.workspace_id is null;

create function private.guard_fleet_smoke_sharing()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_target_user uuid;
  v_target_workspace uuid;
  v_target_email text;
  v_object_owner uuid;
  v_object_workspace uuid;
begin
  case tg_table_name
    when 'workspace_email_invites' then
      v_actor := coalesce(new.invited_by, v_actor);
      v_target_email := new.email;
      v_target_workspace := new.ws_id;
    when 'workspace_invite_links' then
      v_actor := new.creator_id;
      v_target_workspace := new.ws_id;
    when 'workspace_invites' then
      v_target_workspace := new.ws_id;
      v_target_user := new.user_id;
    when 'task_plan_shares' then
      v_actor := new.shared_by_user_id;
      v_target_workspace := new.shared_with_ws_id;
      v_target_user := new.shared_with_user_id;
      v_target_email := new.shared_with_email;
      select owner_id, personal_ws_id into v_object_owner, v_object_workspace
      from public.task_plans where id = new.plan_id;
    when 'task_shares' then
      v_actor := new.shared_by_user_id;
      v_target_user := new.shared_with_user_id;
      v_target_email := new.shared_with_email;
      select t.creator_id, b.ws_id into v_object_owner, v_object_workspace
      from public.tasks t left join public.workspace_boards b on b.id = t.board_id
      where t.id = new.task_id;
    when 'task_board_shares' then
      v_actor := new.shared_by_user_id;
      v_target_user := new.shared_with_user_id;
      v_target_email := new.shared_with_email;
      select creator_id, ws_id into v_object_owner, v_object_workspace
      from public.workspace_boards where id = new.board_id;
    when 'board_template_shares' then
      v_actor := new.created_by;
      v_target_user := new.user_id;
      v_target_email := new.email;
      select created_by, ws_id into v_object_owner, v_object_workspace
      from public.board_templates where id = new.template_id;
    when 'task_share_links' then
      v_actor := new.created_by_user_id;
      select t.creator_id, b.ws_id into v_object_owner, v_object_workspace
      from public.tasks t left join public.workspace_boards b on b.id = t.board_id
      where t.id = new.task_id;
    when 'form_share_links' then
      v_actor := new.created_by_user_id;
      select creator_id, ws_id into v_object_owner, v_object_workspace
      from private.forms where id = new.form_id;
  end case;

  if exists (select from private.fleet_smoke_operations where id in (v_actor, v_target_user, v_object_owner, auth.uid()))
    or exists (
      select from public.workspaces w
      join private.fleet_smoke_operations o on o.id = w.creator_id
      where w.id in (v_target_workspace, v_object_workspace)
    )
    or lower(btrim(v_target_email)) like '%@smoke.tuturuuu.com' then
    raise exception 'Fleet smoke identities cannot send invites or share resources' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_fleet_smoke_sharing() from public, anon, authenticated, service_role;
create trigger guard_fleet_smoke_email_invites before insert or update on public.workspace_email_invites
for each row execute function private.guard_fleet_smoke_sharing();
create trigger guard_fleet_smoke_invite_links before insert or update on public.workspace_invite_links
for each row execute function private.guard_fleet_smoke_sharing();
create trigger guard_fleet_smoke_invites before insert or update on public.workspace_invites
for each row execute function private.guard_fleet_smoke_sharing();
create trigger guard_fleet_smoke_task_plan_shares before insert or update on public.task_plan_shares
for each row execute function private.guard_fleet_smoke_sharing();
create trigger guard_fleet_smoke_task_shares before insert or update on public.task_shares
for each row execute function private.guard_fleet_smoke_sharing();
create trigger guard_fleet_smoke_task_board_shares before insert or update on public.task_board_shares
for each row execute function private.guard_fleet_smoke_sharing();
create trigger guard_fleet_smoke_board_template_shares before insert or update on public.board_template_shares
for each row execute function private.guard_fleet_smoke_sharing();
create trigger guard_fleet_smoke_task_share_links before insert or update on public.task_share_links
for each row execute function private.guard_fleet_smoke_sharing();
create trigger guard_fleet_smoke_form_share_links before insert or update on private.form_share_links
for each row execute function private.guard_fleet_smoke_sharing();
