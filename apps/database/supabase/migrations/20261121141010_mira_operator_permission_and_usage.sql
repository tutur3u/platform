begin;

-- operate_mira_channels gates the cross-tenant Mira operator routes in Admin
-- (apps/docs/platform/ai/mira-cloud-channels.mdx). It is granted to nobody by
-- default. Workspace creators, admin and default permissions never imply it
-- (EXPLICIT_GRANT_PERMISSIONS in @tuturuuu/utils), and API sessions cannot
-- enable it on a role, make it a default permission, or add a member to a role
-- that holds it. A grant runs on a direct database-owner session that first
-- sets the transaction-local flag `tuturuuu.mira_operator_grant = 'owner'`;
-- PostgREST sessions never pass the session_user check.

-- tuturuuu: no-grant (internal)
create function private.mira_operator_grant_allowed()
returns boolean
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select session_user::text not in ('authenticator', 'anon', 'authenticated', 'service_role')
    and pg_has_role(session_user, 'postgres', 'MEMBER')
    and coalesce(current_setting('tuturuuu.mira_operator_grant', true), '') = 'owner'
$$;
revoke all on function private.mira_operator_grant_allowed() from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (trigger)
create function private.guard_mira_operator_role_permission()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.permission::text <> 'operate_mira_channels' or not new.enabled then
    return new;
  end if;
  -- Re-saving an unchanged grant is not a new grant.
  if tg_op = 'UPDATE' and old.enabled and old.permission = new.permission
    and old.role_id = new.role_id and old.ws_id = new.ws_id then
    return new;
  end if;
  if new.ws_id <> '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'operate_mira_channels can only be granted in the root workspace'
      using errcode = '42501';
  end if;
  if not private.mira_operator_grant_allowed() then
    raise exception 'operate_mira_channels is granted only by a database-owner session'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_mira_operator_role_permission() from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (trigger)
create function private.guard_mira_operator_default_permission()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.permission::text = 'operate_mira_channels' and new.enabled then
    raise exception 'operate_mira_channels cannot be a default permission'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_mira_operator_default_permission() from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (trigger)
create function private.guard_mira_operator_role_member()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.role_id = new.role_id and old.user_id = new.user_id then
    return new;
  end if;
  if exists (
    select 1 from public.workspace_role_permissions wrp
    where wrp.role_id = new.role_id
      and wrp.permission::text = 'operate_mira_channels'
      and wrp.enabled
  ) and not private.mira_operator_grant_allowed() then
    raise exception 'members of an operate_mira_channels role are added only by a database-owner session'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_mira_operator_role_member() from public, anon, authenticated, service_role;

create trigger guard_mira_operator_role_permission
  before insert or update on public.workspace_role_permissions
  for each row execute function private.guard_mira_operator_role_permission();
create trigger guard_mira_operator_default_permission
  before insert or update on public.workspace_default_permissions
  for each row execute function private.guard_mira_operator_default_permission();
create trigger guard_mira_operator_role_member
  before insert or update on public.workspace_role_members
  for each row execute function private.guard_mira_operator_role_member();

-- Tenant usage view: settled daily rows per channel and model, bounded to at
-- most 400 days. Unbound channels keep their history.
create function private.mira_list_usage(p_ws_id uuid, p_from date, p_to date)
returns table (
  channel_id uuid,
  model_id text,
  day date,
  replies bigint,
  weighted_replies bigint,
  triaged bigint,
  input_tokens bigint,
  cached_input_tokens bigint,
  output_tokens bigint,
  cost_micro_usd bigint
)
language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_ws_id is null or p_from is null or p_to is null or p_from > p_to
    or p_to - p_from > 400 then
    raise exception 'Invalid Mira usage range' using errcode = '22023';
  end if;
  return query
    select u.channel_id, u.model_id, u.day, u.replies, u.weighted_replies, u.triaged,
      u.input_tokens, u.cached_input_tokens, u.output_tokens, u.cost_micro_usd
    from private.mira_usage_daily u
    where u.ws_id = p_ws_id and u.day between p_from and p_to
    order by u.day, u.channel_id, u.model_id;
end;
$$;
revoke all on function private.mira_list_usage(uuid, date, date) from public, anon, authenticated;
grant execute on function private.mira_list_usage(uuid, date, date) to service_role;

-- Unbinding must not shed a stop the tenant does not own, whether the stop is
-- set on the channel or on the whole tenant. The tenant row is locked so a
-- concurrent operator stop cannot slip between the check and the unbind.
create or replace function private.mira_unbind_channel(p_ws_id uuid, p_channel_id uuid, p_actor_id uuid)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_tenant_reasons text[];
  v_reasons text[];
begin
  select t.stop_reasons into v_tenant_reasons from private.mira_tenants t
  where t.ws_id = p_ws_id
  for share;
  if not found then
    return false;
  end if;
  select c.stop_reasons into v_reasons from private.mira_channels c
  where c.id = p_channel_id and c.ws_id = p_ws_id and c.unbound_at is null
  for update;
  if not found then
    return false;
  end if;
  if (v_reasons || v_tenant_reasons) && array['operator', 'billing', 'cap']::text[] then
    raise exception 'A stop the tenant does not own is set' using errcode = '42501';
  end if;
  update private.mira_channels set unbound_at = clock_timestamp(), status = 'draft'
  where id = p_channel_id;
  -- The caller purges the named vault variables before unbinding.
  delete from private.mira_channel_secret_refs where channel_id = p_channel_id;
  insert into private.mira_audit_events (ws_id, channel_id, actor_kind, actor_id, action, reason_code)
  values (p_ws_id, p_channel_id, 'tenant_manager', p_actor_id, 'channel.unbind', 'removed');
  return true;
end;
$$;
revoke all on function private.mira_unbind_channel(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.mira_unbind_channel(uuid, uuid, uuid) to service_role;

commit;
