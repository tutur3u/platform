-- Platform-wide runtime flag state and append-only audit.
-- Identity is flag key plus environment. Revision stays monotonic across
-- reset tombstones. Application clients have no table DML. The service-role
-- entrypoints are the only writers, and a transaction-local gate rejects
-- direct owner writes. Append-only rows are not cryptographic tamper evidence.
-- Rollback: apps/database/rollbacks/20261109170000_platform_feature_flag_state_audit.rollback.sql

set lock_timeout = '5s';
set statement_timeout = '60s';

create function private.platform_feature_flag_family(p_key text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $flag$
  select case p_key
    when 'mobile_offline' then 'mobile-runtime'
    when 'offline_read_habits' then 'mobile-runtime'
    when 'offline_read_time_tracker' then 'mobile-runtime'
    when 'offline_read_home' then 'mobile-runtime'
    when 'offline_read_reminders' then 'mobile-runtime'
    when 'offline_read_mastermind' then 'mobile-runtime'
    when 'offline_read_notes' then 'mobile-runtime'
    when 'offline_read_documents' then 'mobile-runtime'
    when 'offline_read_mail' then 'mobile-runtime'
    when 'offline_read_chat' then 'mobile-runtime'
    when 'offline_read_mira' then 'mobile-runtime'
    when 'offline_read_drive_list' then 'mobile-runtime'
    when 'offline_edit_finance' then 'mobile-runtime'
    when 'offline_edit_tasks' then 'mobile-runtime'
    when 'offline_edit_calendar' then 'mobile-runtime'
    when 'offline_status_ui' then 'mobile-runtime'
    when 'ENABLE_AI' then 'workspace-secret'
    when 'ENABLE_EDUCATION' then 'workspace-secret'
    when 'ENABLE_QUIZZES' then 'workspace-secret'
    when 'ENABLE_CHALLENGES' then 'workspace-secret'
    when 'ENABLE_AI_ONLY' then 'workspace-secret'
    when 'ENABLE_CHAT' then 'workspace-secret'
    when 'ENABLE_TASKS' then 'workspace-secret'
    when 'ENABLE_DOCS' then 'workspace-secret'
    when 'ENABLE_DRIVE' then 'workspace-secret'
    when 'ENABLE_SLIDES' then 'workspace-secret'
    when 'DISABLE_INVITE' then 'workspace-secret'
    when 'PREVENT_WORKSPACE_DELETION' then 'workspace-secret'
    when 'ENABLE_AVATAR' then 'workspace-secret'
    when 'ENABLE_LOGO' then 'workspace-secret'
    when 'ENABLE_API_KEYS' then 'workspace-secret'
    when 'EXTERNAL_PROJECT_ENABLED' then 'workspace-secret'
    when 'ENABLE_X' then 'workspace-secret'
    when 'ENABLE_WHITEBOARDS' then 'workspace-secret'
    when 'ENABLE_USERS' then 'workspace-secret'
    when 'ENABLE_TOPIC_ANNOUNCEMENTS' then 'workspace-secret'
    when 'ENABLE_PROJECTS' then 'workspace-secret'
    when 'ENABLE_LINK_SHORTENER' then 'workspace-secret'
    when 'ENABLE_HABITS' then 'workspace-secret'
    when 'ENABLE_INVENTORY' then 'workspace-secret'
    when 'ENABLE_FINANCE' then 'workspace-secret'
    when 'ENABLE_FEE_LOCK' then 'workspace-secret'
    when 'ENABLE_EMAIL_SENDING' then 'workspace-secret'
    when 'ENABLE_REPORT_EMAIL_SENDING' then 'workspace-secret'
    when 'ENABLE_CALENDAR' then 'workspace-secret'
    when 'ENABLE_BLACKBOX' then 'workspace-secret'
    when 'ENABLE_AI_PLAYGROUND' then 'workspace-secret'
    when 'ALLOW_CRAWLERS' then 'workspace-secret'
    when 'newsletter_sending' then 'workspace-secret'
    when 'MOBILE_TASK_DESCRIPTION_EDITING_ENABLED' then 'mobile-build'
    when 'MOBILE_CALENDAR_INTEGRATIONS_ENABLED' then 'mobile-build'
    else null
  end;
$flag$;

comment on function private.platform_feature_flag_family(text) is
  'Catalog family for a platform flag key. Null means the key is not a catalog entry.';

revoke all on function private.platform_feature_flag_family(text)
  from public, anon, authenticated, service_role;

create table private.platform_feature_flag_state (
  flag_key text not null,
  environment text not null,
  override_enabled boolean,
  revision bigint not null,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_by uuid not null,
  constraint platform_feature_flag_state_pk primary key (flag_key, environment),
  constraint platform_feature_flag_state_environment_check
    check (environment in ('development', 'staging', 'production')),
  constraint platform_feature_flag_state_family_check
    check (private.platform_feature_flag_family(flag_key) = 'mobile-runtime'),
  constraint platform_feature_flag_state_revision_check
    check (revision > 0)
);

comment on table private.platform_feature_flag_state is
  'Runtime override for one registry flag and environment. Null override_enabled is a reset tombstone. Revision never returns to zero.';

comment on column private.platform_feature_flag_state.override_enabled is
  'Stored override. Null means the registry default is in effect.';

alter table private.platform_feature_flag_state enable row level security;

create policy platform_feature_flag_state_deny_client
  on private.platform_feature_flag_state
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table private.platform_feature_flag_state
  from public, anon, authenticated, service_role;

create table private.platform_feature_flag_audit (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  operation_id uuid not null,
  flag_key text not null,
  environment text not null,
  actor_id uuid not null,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  old_override boolean,
  new_override boolean,
  old_revision bigint not null,
  new_revision bigint not null,
  constraint platform_feature_flag_audit_operation_key unique (operation_id),
  constraint platform_feature_flag_audit_environment_check
    check (environment in ('development', 'staging', 'production')),
  constraint platform_feature_flag_audit_family_check
    check (private.platform_feature_flag_family(flag_key) = 'mobile-runtime'),
  constraint platform_feature_flag_audit_revision_check
    check (
      old_revision >= 0
      and new_revision = old_revision + 1
      and new_revision > 0
    )
);

comment on table private.platform_feature_flag_audit is
  'Append-only mutation receipt. One operation id reconciles an unknown response. Not a cryptographic tamper-evidence log.';

alter table private.platform_feature_flag_audit enable row level security;

create policy platform_feature_flag_audit_deny_client
  on private.platform_feature_flag_audit
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table private.platform_feature_flag_audit
  from public, anon, authenticated, service_role;

create function private.platform_feature_flag_reject_direct_write()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $flag$
begin
  if pg_catalog.current_setting('platform_feature_flags.entrypoint', true)
    is distinct from 'mutate'
  then
    raise exception 'platform_feature_flag_direct_write' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'platform_feature_flag_state_delete' using errcode = '42501';
  end if;
  return new;
end;
$flag$;

revoke all on function private.platform_feature_flag_reject_direct_write()
  from public, anon, authenticated, service_role;

create trigger platform_feature_flag_state_guard
  before insert or update or delete on private.platform_feature_flag_state
  for each row execute function private.platform_feature_flag_reject_direct_write();

create function private.platform_feature_flag_reject_audit_change()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $flag$
begin
  raise exception 'platform_feature_flag_audit_immutable' using errcode = '42501';
end;
$flag$;

revoke all on function private.platform_feature_flag_reject_audit_change()
  from public, anon, authenticated, service_role;

create trigger platform_feature_flag_audit_guard
  before update or delete on private.platform_feature_flag_audit
  for each row execute function private.platform_feature_flag_reject_audit_change();

create function private.platform_feature_flag_require_permission(
  p_actor uuid,
  p_permission text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $flag$
declare
  v_root uuid := '00000000-0000-0000-0000-000000000000'::uuid;
begin
  if p_actor is null
    or public.has_workspace_permission(v_root, p_actor, p_permission)
      is distinct from true
  then
    raise exception 'platform_feature_flag_denied' using errcode = '42501';
  end if;
end;
$flag$;

comment on function private.platform_feature_flag_require_permission(uuid, text) is
  'Root-workspace permission via public.has_workspace_permission. End-user JWTs cannot evaluate another actor.';

revoke all on function private.platform_feature_flag_require_permission(uuid, text)
  from public, anon, authenticated, service_role;

create function private.platform_feature_flag_mutate(
  p_actor uuid,
  p_operation_id uuid,
  p_flag_key text,
  p_environment text,
  p_override_enabled boolean,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '5s'
as $flag$
declare
  v_family text;
  v_state private.platform_feature_flag_state%rowtype;
  v_audit private.platform_feature_flag_audit%rowtype;
  v_old_override boolean;
  v_old_revision bigint;
  v_new_revision bigint;
begin
  perform private.platform_feature_flag_require_permission(
    p_actor,
    'manage_workspace_roles'
  );
  if p_operation_id is null then
    raise exception 'platform_feature_flag_invalid_operation' using errcode = '22023';
  end if;

  v_family := private.platform_feature_flag_family(p_flag_key);
  if v_family = 'workspace-secret' then
    raise exception 'platform_feature_flag_read_only_workspace_secret'
      using errcode = '22023';
  end if;
  if v_family = 'mobile-build' then
    raise exception 'platform_feature_flag_read_only_mobile_build'
      using errcode = '22023';
  end if;
  if v_family is distinct from 'mobile-runtime' then
    raise exception 'platform_feature_flag_unknown_flag' using errcode = '22023';
  end if;
  if p_environment is null
    or p_environment not in ('development', 'staging', 'production')
  then
    raise exception 'platform_feature_flag_unknown_environment'
      using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'platform_feature_flag_invalid_revision' using errcode = '22023';
  end if;

  select *
    into v_audit
  from private.platform_feature_flag_audit
  where operation_id = p_operation_id;
  if found then
    return pg_catalog.jsonb_build_object(
      'status', 'replayed',
      'code', 'replayed',
      'replayed', true,
      'matchesRequest',
        v_audit.flag_key = p_flag_key
        and v_audit.environment = p_environment
        and v_audit.new_override is not distinct from p_override_enabled,
      'revision', v_audit.new_revision,
      'oldOverride', v_audit.old_override,
      'newOverride', v_audit.new_override,
      'oldRevision', v_audit.old_revision,
      'newRevision', v_audit.new_revision,
      'operationId', v_audit.operation_id,
      'flagKey', v_audit.flag_key,
      'environment', v_audit.environment,
      'storage', false
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'platform_feature_flag:' || p_flag_key || ':' || p_environment,
      0
    )
  );

  select *
    into v_audit
  from private.platform_feature_flag_audit
  where operation_id = p_operation_id;
  if found then
    return pg_catalog.jsonb_build_object(
      'status', 'replayed',
      'code', 'replayed',
      'replayed', true,
      'matchesRequest',
        v_audit.flag_key = p_flag_key
        and v_audit.environment = p_environment
        and v_audit.new_override is not distinct from p_override_enabled,
      'revision', v_audit.new_revision,
      'oldOverride', v_audit.old_override,
      'newOverride', v_audit.new_override,
      'oldRevision', v_audit.old_revision,
      'newRevision', v_audit.new_revision,
      'operationId', v_audit.operation_id,
      'flagKey', v_audit.flag_key,
      'environment', v_audit.environment,
      'storage', false
    );
  end if;

  select *
    into v_state
  from private.platform_feature_flag_state
  where flag_key = p_flag_key
    and environment = p_environment
  for update;

  if not found then
    if p_expected_revision <> 0 then
      return pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'code', 'conflict',
        'flagKey', p_flag_key,
        'environment', p_environment,
        'revision', null,
        'storage', false
      );
    end if;
    if p_override_enabled is null then
      return pg_catalog.jsonb_build_object(
        'status', 'noop',
        'code', 'noop',
        'flagKey', p_flag_key,
        'environment', p_environment,
        'overrideEnabled', null,
        'revision', 0,
        'storage', false
      );
    end if;
    v_old_override := null;
    v_old_revision := 0;
  elsif v_state.revision <> p_expected_revision then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'code', 'conflict',
      'flagKey', p_flag_key,
      'environment', p_environment,
      'revision', v_state.revision,
      'storage', false
    );
  elsif v_state.override_enabled is not distinct from p_override_enabled then
    return pg_catalog.jsonb_build_object(
      'status', 'noop',
      'code', 'noop',
      'flagKey', p_flag_key,
      'environment', p_environment,
      'overrideEnabled', v_state.override_enabled,
      'revision', v_state.revision,
      'storage', false
    );
  else
    v_old_override := v_state.override_enabled;
    v_old_revision := v_state.revision;
  end if;

  v_new_revision := v_old_revision + 1;
  perform pg_catalog.set_config('platform_feature_flags.entrypoint', 'mutate', true);

  if v_old_revision = 0 then
    insert into private.platform_feature_flag_state (
      flag_key,
      environment,
      override_enabled,
      revision,
      updated_at,
      updated_by
    ) values (
      p_flag_key,
      p_environment,
      p_override_enabled,
      v_new_revision,
      pg_catalog.clock_timestamp(),
      p_actor
    );
  else
    update private.platform_feature_flag_state
      set override_enabled = p_override_enabled,
          revision = v_new_revision,
          updated_at = pg_catalog.clock_timestamp(),
          updated_by = p_actor
    where flag_key = p_flag_key
      and environment = p_environment;
  end if;

  insert into private.platform_feature_flag_audit (
    operation_id,
    flag_key,
    environment,
    actor_id,
    occurred_at,
    old_override,
    new_override,
    old_revision,
    new_revision
  ) values (
    p_operation_id,
    p_flag_key,
    p_environment,
    p_actor,
    pg_catalog.clock_timestamp(),
    v_old_override,
    p_override_enabled,
    v_old_revision,
    v_new_revision
  );

  return pg_catalog.jsonb_build_object(
    'status', 'applied',
    'code', 'applied',
    'replayed', false,
    'matchesRequest', true,
    'revision', v_new_revision,
    'oldOverride', v_old_override,
    'newOverride', p_override_enabled,
    'oldRevision', v_old_revision,
    'newRevision', v_new_revision,
    'operationId', p_operation_id,
    'flagKey', p_flag_key,
    'environment', p_environment,
    'storage', true
  );
exception
  when unique_violation then
    select *
      into v_audit
    from private.platform_feature_flag_audit
    where operation_id = p_operation_id;
    if found then
      return pg_catalog.jsonb_build_object(
        'status', 'replayed',
        'code', 'replayed',
        'replayed', true,
        'matchesRequest',
          v_audit.flag_key = p_flag_key
          and v_audit.environment = p_environment
          and v_audit.new_override is not distinct from p_override_enabled,
        'revision', v_audit.new_revision,
        'oldOverride', v_audit.old_override,
        'newOverride', v_audit.new_override,
        'oldRevision', v_audit.old_revision,
        'newRevision', v_audit.new_revision,
        'operationId', v_audit.operation_id,
        'flagKey', v_audit.flag_key,
        'environment', v_audit.environment,
        'storage', false
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'code', 'conflict',
      'flagKey', p_flag_key,
      'environment', p_environment,
      'revision', null,
      'storage', false
    );
end;
$flag$;

comment on function private.platform_feature_flag_mutate(uuid, uuid, text, text, boolean, bigint) is
  'Compares expected revision, writes state, and inserts one audit row in this transaction.';

revoke all on function private.platform_feature_flag_mutate(uuid, uuid, text, text, boolean, bigint)
  from public, anon, authenticated;
grant execute on function private.platform_feature_flag_mutate(uuid, uuid, text, text, boolean, bigint)
  to service_role;

create function private.platform_feature_flag_read_state(p_actor uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, pg_temp
as $flag$
begin
  perform private.platform_feature_flag_require_permission(
    p_actor,
    'view_infrastructure'
  );
  return pg_catalog.jsonb_build_object(
    'overrides',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'flagKey', flag_key,
            'environment', environment,
            'overrideEnabled', override_enabled,
            'revision', revision,
            'updatedAt', updated_at
          )
          order by flag_key, environment
        )
        from private.platform_feature_flag_state
      ),
      '[]'::jsonb
    )
  );
end;
$flag$;

revoke all on function private.platform_feature_flag_read_state(uuid)
  from public, anon, authenticated;
grant execute on function private.platform_feature_flag_read_state(uuid)
  to service_role;

create function private.platform_feature_flag_read_audit(
  p_actor uuid,
  p_limit integer default 50,
  p_before timestamptz default null,
  p_operation_id uuid default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, pg_temp
as $flag$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  perform private.platform_feature_flag_require_permission(
    p_actor,
    'view_infrastructure'
  );
  return pg_catalog.jsonb_build_object(
    'rows',
    coalesce(
      (
        select pg_catalog.jsonb_agg(item)
        from (
          select pg_catalog.jsonb_build_object(
            'operationId', operation_id,
            'flagKey', flag_key,
            'environment', environment,
            'actorId', actor_id,
            'occurredAt', occurred_at,
            'oldOverride', old_override,
            'newOverride', new_override,
            'oldRevision', old_revision,
            'newRevision', new_revision
          ) as item
          from private.platform_feature_flag_audit
          where (p_operation_id is null or operation_id = p_operation_id)
            and (p_before is null or occurred_at < p_before)
          order by occurred_at desc, id desc
          limit v_limit
        ) bounded
      ),
      '[]'::jsonb
    )
  );
end;
$flag$;

revoke all on function private.platform_feature_flag_read_audit(uuid, integer, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function private.platform_feature_flag_read_audit(uuid, integer, timestamptz, uuid)
  to service_role;

create function private.platform_feature_flag_runtime_read(p_environment text)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, pg_temp
as $flag$
declare
  v_role text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
begin
  if v_role is not null and v_role is distinct from 'service_role' then
    raise exception 'platform_feature_flag_denied' using errcode = '42501';
  end if;
  if p_environment is null
    or p_environment not in ('development', 'staging', 'production')
  then
    raise exception 'platform_feature_flag_unknown_environment'
      using errcode = '22023';
  end if;
  return pg_catalog.jsonb_build_object(
    'overrides',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'flagKey', flag_key,
            'overrideEnabled', override_enabled,
            'revision', revision
          )
          order by flag_key
        )
        from private.platform_feature_flag_state
        where environment = p_environment
      ),
      '[]'::jsonb
    )
  );
end;
$flag$;

comment on function private.platform_feature_flag_runtime_read(text) is
  'Service-role runtime overrides for one server-selected environment. Not an admin audit read.';

revoke all on function private.platform_feature_flag_runtime_read(text)
  from public, anon, authenticated;
grant execute on function private.platform_feature_flag_runtime_read(text)
  to service_role;
