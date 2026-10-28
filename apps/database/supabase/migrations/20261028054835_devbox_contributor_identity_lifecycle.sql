begin;
-- S1 creates new functions only. Never redefines claim_next_devbox_run:
-- its newest prior body is 20261026145300_reap_stale_devbox_runs.sql:141.
-- TT Security owns SR-332/333/334 and their INSERT/UPDATE ownership triggers.
create or replace function private.devbox_identity_is_root_member(p_user_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
    select exists (select 1 from public.workspace_members
        where ws_id = '00000000-0000-0000-0000-000000000000'::uuid
            and user_id = p_user_id and type = 'MEMBER');
$$;

create or replace function private.devbox_identity_guard_grant()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
    if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.id <> old.id
        or new.bound_email <> old.bound_email or new.created_at <> old.created_at
        or new.sessions_not_before < old.sessions_not_before) then
        raise exception 'Devbox grant identity is immutable' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
        if new.status <> 'pending' or new.accepted_at is not null then
            raise exception 'Devbox grant must start pending' using errcode = '42501';
        end if;
        if (select count(*) from auth.users u where lower(u.email) = lower(new.bound_email)) <> 1
            or not exists (select 1 from auth.users u where u.id = new.user_id
            and lower(u.email) = lower(new.bound_email) and u.email_confirmed_at is not null)
        then raise exception 'Confirmed bound user required' using errcode = '42501'; end if;
    end if;
    if new.status in ('pending', 'active') and private.devbox_identity_is_root_member(new.user_id)
    then raise exception 'Root members cannot have personal grants' using errcode = '42501'; end if;
    if new.status in ('revoked','suspended','expired') or new.suspended then
        new.sessions_not_before := greatest(new.sessions_not_before, now());
    end if;
    new.revoked_at := case when new.status = 'revoked' then coalesce(new.revoked_at, now()) else null end;
    new.suspended := new.suspended or new.status = 'suspended';
    if new.suspended then new.suspended_at := coalesce(new.suspended_at,now()); end if;
    new.updated_at := now();
    return new;
end;
$$;
drop trigger if exists devbox_identity_guard_grant on private.devbox_personal_pool_grants;
create trigger devbox_identity_guard_grant before insert or update
    on private.devbox_personal_pool_grants for each row
    execute function private.devbox_identity_guard_grant();

create or replace function private.devbox_identity_audit()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
    insert into private.devbox_grant_events(user_id, event_type, subject_id,
        acting_user_id, acting_role, old_status, new_status)
    values (new.user_id, tg_table_name || ':' || lower(tg_op), new.id,
        coalesce(nullif(current_setting('devbox.operator_id',true),'')::uuid, auth.uid()),
        coalesce(nullif(current_setting('request.jwt.claim.role',true),''),session_user),
        case when tg_op = 'UPDATE' then to_jsonb(old)->>'status' end, to_jsonb(new)->>'status');
    return new;
end;
$$;
drop trigger if exists devbox_identity_audit_grant on private.devbox_personal_pool_grants;
create trigger devbox_identity_audit_grant after insert or update
    on private.devbox_personal_pool_grants for each row execute function private.devbox_identity_audit();
drop trigger if exists devbox_identity_audit_token on private.devbox_access_tokens;
create trigger devbox_identity_audit_token after insert or update
    on private.devbox_access_tokens for each row execute function private.devbox_identity_audit();

create or replace function private.devbox_identity_guard_token()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare g private.devbox_personal_pool_grants;
begin
    -- Serialize both issuance and UPDATE against grant changes (Desk F14d/A13).
    select * into g from private.devbox_personal_pool_grants
        where user_id = new.user_id for update;
    if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.grant_id <> old.grant_id
        or new.token_hash <> old.token_hash or new.created_at <> old.created_at
        or new.scopes <> old.scopes or new.expires_at > old.expires_at
        or (old.revoked_at is not null and (new.revoked_at is distinct from old.revoked_at
            or new.revoked_by is distinct from old.revoked_by))) then
        raise exception 'Devbox token identity is immutable' using errcode = '42501';
    end if;
    -- Revocation remains possible after expiry, suspension, or switch-off.
    if new.revoked_at is not null then return new; end if;
    if g.id is distinct from new.grant_id
        or not private.devbox_identity_grant_active(new.user_id)
        or new.expires_at > g.expires_at or new.expires_at <= now() then
        raise exception 'Active matching devbox grant required' using errcode = '42501';
    end if;
    if (select count(*) from private.devbox_access_tokens
        where user_id = new.user_id and id <> new.id and revoked_at is null
            and expires_at > now()) >= g.max_access_tokens then
        raise exception 'Devbox token limit reached' using errcode = '42501';
    end if;
    return new;
end;
$$;
drop trigger if exists devbox_identity_guard_token on private.devbox_access_tokens;
create trigger devbox_identity_guard_token before insert or update on private.devbox_access_tokens
    for each row execute function private.devbox_identity_guard_token();

create or replace function private.revoke_devbox_access_token(p_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare t private.devbox_access_tokens;
begin
    -- Grant -> token -> runs lock order matches creation and grant revocation.
    perform 1 from private.devbox_personal_pool_grants where user_id = p_user_id for update;
    select * into t from private.devbox_access_tokens where id = p_id and user_id = p_user_id for update;
    if not found then return false; end if;
    update private.devbox_access_tokens set revoked_at = coalesce(revoked_at, now()),
        revoked_by = p_user_id where id = p_id and revoked_at is null;
    update private.devbox_runs set status = case when status = 'queued' then 'cancelled'
        else 'cancel_requested' end, completed_at = case when status = 'queued' then now()
        else completed_at end, updated_at = now()
        where access_token_id = p_id and status in ('queued', 'running');
    update private.devbox_leases set status = 'released', released_at = now(), updated_at = now()
        where access_token_id = p_id and status = 'active';
    return true;
end;
$$;

-- Direct status changes use the same transactional cascade as operator RPCs.
create or replace function private.devbox_identity_cascade_grant()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare operator_id uuid := coalesce(nullif(current_setting('devbox.operator_id',true),'')::uuid,auth.uid());
begin
    if new.status not in ('revoked','suspended','expired') and not new.suspended
        and new.expires_at > now() then return new; end if;
    update private.devbox_access_tokens set revoked_at = now(), revoked_by = operator_id
        where user_id = new.user_id and revoked_at is null;
    update private.devbox_runs set status = case when status = 'queued' then 'cancelled'
        else 'cancel_requested' end, completed_at = case when status = 'queued' then now()
        else completed_at end, updated_at = now()
        where actor_id = new.user_id and status in ('queued','running');
    update private.devbox_leases set status='released',released_at=now(),updated_at=now()
        where actor_id = new.user_id and status='active';
    update private.devbox_runner_tokens set revoked_at=now()
        where revoked_at is null and runner_id in
            (select id from private.devbox_runners where actor_id=new.user_id);
    return new;
end;
$$;
drop trigger if exists devbox_identity_cascade_grant on private.devbox_personal_pool_grants;
create trigger devbox_identity_cascade_grant after update of status, suspended, expires_at, revoked_at
    on private.devbox_personal_pool_grants for each row execute function private.devbox_identity_cascade_grant();

create or replace function private.revoke_devbox_personal_identity(p_user_id uuid,
    p_suspend boolean default false, p_operator_id uuid default null)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare previous_operator text := current_setting('devbox.operator_id',true);
begin
    perform set_config('devbox.operator_id',coalesce(p_operator_id::text,''),true);
    update private.devbox_personal_pool_grants set
        status=case when p_suspend then 'suspended' else 'revoked' end,
        sessions_not_before=greatest(sessions_not_before,now()) where user_id=p_user_id;
    perform set_config('devbox.operator_id',coalesce(previous_operator,''),true);
end;
$$;

-- One bounded batch per Cloudflare schedule; no database scheduler or retries.
create or replace function private.expire_devbox_personal_grants(p_limit integer default 25)
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare expired_count integer;
begin
    with due as (
        select user_id from private.devbox_personal_pool_grants
        where status not in ('revoked','expired') and expires_at <= now()
        order by expires_at,user_id limit least(greatest(coalesce(p_limit,25),1),100)
        for update skip locked
    )
    update private.devbox_personal_pool_grants g set status='expired'
        from due where g.user_id=due.user_id;
    get diagnostics expired_count = row_count;
    return expired_count;
end;
$$;

create or replace function private.devbox_identity_membership_changed()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
    if new.ws_id = '00000000-0000-0000-0000-000000000000'::uuid and new.type = 'MEMBER'
        and exists (select 1 from private.devbox_personal_pool_grants
            where user_id = new.user_id and status in ('pending', 'active'))
    then perform private.revoke_devbox_personal_identity(new.user_id, true); end if;
    return new;
end;
$$;
drop trigger if exists devbox_identity_membership_changed on public.workspace_members;
create trigger devbox_identity_membership_changed after insert or update
    on public.workspace_members for each row execute function private.devbox_identity_membership_changed();

create or replace function private.accept_devbox_personal_grant(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
    -- The web adapter supplies only its revalidated session subject, never a body id.
    update private.devbox_personal_pool_grants set status = 'active', accepted_at = now(),
        sessions_not_before = now() where user_id = p_user_id and status = 'pending' and not suspended and expires_at > now();
    return found;
end;
$$;

create or replace function private.issue_devbox_access_token(p_user_id uuid, p_issued_at timestamptz,
    p_label text, p_hash text, p_prefix text, p_scopes text[], p_expires_at timestamptz, p_cli boolean default true)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare g private.devbox_personal_pool_grants; token_id uuid;
begin
    select * into g from private.devbox_personal_pool_grants where user_id = p_user_id for update;
    if g.accepted_at is null or p_issued_at is null or p_cli is null
        or p_issued_at < greatest(g.accepted_at, g.sessions_not_before)
        or p_issued_at > now() then
        raise exception 'Devbox session reauthentication required' using errcode = '42501';
    end if;
    insert into private.devbox_access_tokens(user_id, grant_id, label, token_hash, token_prefix, scopes, expires_at)
        values (p_user_id, g.id, p_label, p_hash, p_prefix, p_scopes, least(p_expires_at, g.expires_at))
        returning id into token_id;
    return token_id;
end;
$$;

create or replace function private.resolve_devbox_identity(p_user_id uuid default null, p_hash text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare t private.devbox_access_tokens; g private.devbox_personal_pool_grants;
begin
    if p_hash is not null then
        select * into t from private.devbox_access_tokens where token_hash = p_hash;
        if not found or t.revoked_at is not null or t.expires_at <= now() then return null; end if;
        p_user_id := t.user_id;
    end if;
    select * into g from private.devbox_personal_pool_grants where user_id = p_user_id;
    return jsonb_build_object('enabled', coalesce((select personal_pools_enabled
        from private.devbox_control_settings where id), false),
        'grant', case when g.id is null then null else to_jsonb(g) end,
        'token', case when t.id is null then null else jsonb_build_object('id', t.id,
            'user_id', t.user_id, 'grant_id', t.grant_id, 'scopes', t.scopes) end);
end;
$$;

-- Identity attribution is authoritative for INSERT and UPDATE. This is separate
-- from TT Security's runner/lease ownership triggers (SR-333/334).
create or replace function private.devbox_identity_guard_work()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare t private.devbox_access_tokens; g private.devbox_personal_pool_grants;
begin
    -- Revocation/status-only updates must remain possible while disabled.
    if tg_op = 'UPDATE' and new.actor_id = old.actor_id
        and new.access_token_id is not distinct from old.access_token_id
        and (tg_table_name <> 'devbox_runs' or to_jsonb(new)->>'workload' = to_jsonb(old)->>'workload')
        then return new; end if;
    if new.access_token_id is null then
        if tg_table_name = 'devbox_runs' and to_jsonb(new)->>'workload' in ('judge','playground') then
            return new;
        end if;
        -- Learner pool leases are admitted by the ownership guard in SR-334.
        if tg_table_name = 'devbox_leases' then return new; end if;
        if exists (select 1 from private.devbox_personal_pool_grants where user_id = new.actor_id)
            and not private.devbox_identity_is_root_member(new.actor_id) then
            raise exception 'Devbox access token required' using errcode = '42501';
        end if;
        return new;
    end if;
    select * into g from private.devbox_personal_pool_grants where user_id = new.actor_id for update;
    select * into t from private.devbox_access_tokens where id = new.access_token_id for share;
    if t.user_id is distinct from new.actor_id or t.grant_id is distinct from g.id
        or t.revoked_at is not null or t.expires_at <= now()
        or not private.devbox_identity_grant_active(new.actor_id) then
        raise exception 'Active devbox token required' using errcode = '42501';
    end if;
    if tg_table_name = 'devbox_runs' then
        if new.workload not in ('run', 'build') or not ('devbox:' || new.workload = any(t.scopes)) then
            raise exception 'Devbox token scope denied' using errcode = '42501';
        end if;
    elsif not (t.scopes && array['devbox:run', 'devbox:build']) then
        raise exception 'Devbox token scope denied' using errcode = '42501';
    end if;
    return new;
end;
$$;
drop trigger if exists devbox_identity_guard_run on private.devbox_runs;
create trigger devbox_identity_guard_run before insert or update on private.devbox_runs
    for each row execute function private.devbox_identity_guard_work();
drop trigger if exists devbox_identity_guard_lease on private.devbox_leases;
create trigger devbox_identity_guard_lease before insert or update on private.devbox_leases
    for each row execute function private.devbox_identity_guard_work();

create or replace function private.list_devbox_access_tokens(p_user_id uuid)
returns jsonb language sql security definer set search_path = pg_catalog, pg_temp
as $$
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', label,
        'token_prefix', token_prefix, 'scopes', scopes, 'expires_at', expires_at,
        'revoked_at', revoked_at, 'created_at', created_at) order by created_at desc), '[]'::jsonb)
    from private.devbox_access_tokens where user_id = p_user_id;
$$;

create or replace function private.devbox_identity_guard_runner_token()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare g private.devbox_personal_pool_grants;
begin
    select grant_row.* into g from private.devbox_personal_pool_grants grant_row
        join private.devbox_runners runner on runner.actor_id = grant_row.user_id
        where runner.id = new.runner_id for update of grant_row;
    if new.revoked_at is not null then return new; end if;
    if g.id is not null and (new.expires_at is null or new.expires_at > g.expires_at
        or new.expires_at <= now() or not private.devbox_identity_grant_active(g.user_id)) then
        raise exception 'Personal runner expiry must fit an active grant' using errcode = '42501';
    end if;
    return new;
end;
$$;
drop trigger if exists devbox_identity_guard_runner_token on private.devbox_runner_tokens;
create trigger devbox_identity_guard_runner_token before insert or update on private.devbox_runner_tokens
    for each row execute function private.devbox_identity_guard_runner_token();

-- Each new private devbox function, including trigger helpers, is service-role only.
do $$
declare f record;
begin
    for f in select p.oid::regprocedure as signature from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private'
        and (p.proname like 'devbox_identity_%' or p.proname in (
            'revoke_devbox_access_token', 'revoke_devbox_personal_identity',
            'expire_devbox_personal_grants', 'accept_devbox_personal_grant', 'issue_devbox_access_token', 'resolve_devbox_identity', 'list_devbox_access_tokens'))
    loop
        execute format('revoke all on function %s from public, anon, authenticated', f.signature);
        execute format('grant execute on function %s to service_role', f.signature);
    end loop;
end;
$$;
commit;
