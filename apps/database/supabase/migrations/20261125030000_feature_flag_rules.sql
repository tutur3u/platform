-- Runtime feature flag rule store: definitions synced from deployed code, one
-- rule per flag, scope, subject and environment, and an append-only audit.
-- Clients have no table DML. Service-role definer RPCs are the only writers; a
-- transaction-local entrypoint setting, cleared before each RPC returns,
-- rejects direct owner writes. The rule CHECK and the mutate RPC share one
-- shape function, mirroring ruleShapeError in @tuturuuu/feature-flags.
-- Rollback: apps/database/rollbacks/20261125030000_feature_flag_rules.rollback.sql

set lock_timeout = '5s';
set statement_timeout = '60s';

create function private.feature_flag_rule_shape_error(
  p_scope text, p_subject_id uuid, p_mode text, p_percentage integer,
  p_allow_workspace_ids uuid[], p_allow_user_ids uuid[]
)
returns text language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $flag$
  select case
    when p_scope is null or p_scope not in ('platform', 'workspace', 'user')
      then 'feature_flag_invalid_scope'
    when (p_scope = 'platform') is distinct from (p_subject_id is null)
      then 'feature_flag_invalid_subject'
    when p_mode is not null and p_mode not in ('on', 'off', 'staff', 'rollout')
      then 'feature_flag_invalid_mode'
    when p_scope = 'user' and p_mode is not null and p_mode not in ('on', 'off')
      then 'feature_flag_user_mode'
    when p_mode = 'rollout'
      and (p_percentage is null or p_percentage < 0 or p_percentage > 100)
      then 'feature_flag_invalid_percentage'
    when p_mode is distinct from 'rollout' and p_percentage is not null
      then 'feature_flag_invalid_percentage'
    when (
        p_allow_workspace_ids is not null
        and (
          p_mode is distinct from 'rollout'
          or pg_catalog.array_ndims(p_allow_workspace_ids) > 1
          or pg_catalog.cardinality(p_allow_workspace_ids) > 500
          or pg_catalog.array_position(p_allow_workspace_ids, null) is not null
        )
      )
      or (
        p_allow_user_ids is not null
        and (
          p_mode is distinct from 'rollout'
          or pg_catalog.array_ndims(p_allow_user_ids) > 1
          or pg_catalog.cardinality(p_allow_user_ids) > 500
          or pg_catalog.array_position(p_allow_user_ids, null) is not null
        )
      )
      then 'feature_flag_invalid_allow_list'
    else null
  end;
$flag$;

comment on function private.feature_flag_rule_shape_error(text, uuid, text, integer, uuid[], uuid[]) is
  'First shape violation of a rule, or null. A null mode is an unset rule. Mirrors ruleShapeError in @tuturuuu/feature-flags.';

-- tuturuuu: no-grant (internal)
revoke all on function private.feature_flag_rule_shape_error(text, uuid, text, integer, uuid[], uuid[])
  from public, anon, authenticated, service_role;

create function private.feature_flag_definition_error(
  p_flag_key text, p_kind text, p_scopes text[], p_controllers jsonb,
  p_delegate text
)
returns text language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $flag$
  select case
    when p_flag_key is null or p_flag_key !~ '^[A-Za-z][A-Za-z0-9_]{0,99}$'
      then 'feature_flag_invalid_definition_key'
    when p_kind is null
      or p_kind not in ('release', 'kill-switch', 'workspace-gate', 'safety-control', 'operational')
      then 'feature_flag_invalid_definition_kind'
    when p_scopes is null
      or pg_catalog.array_ndims(p_scopes) is distinct from 1
      or pg_catalog.array_position(p_scopes, null) is not null
      or not (p_scopes <@ array['platform', 'workspace', 'user']::text[])
      or not ('platform' = any (p_scopes))
      or (select pg_catalog.count(distinct scope) from pg_catalog.unnest(p_scopes) as scope)
        <> pg_catalog.cardinality(p_scopes)
      then 'feature_flag_invalid_definition_scopes'
    when p_controllers is null
      or pg_catalog.jsonb_typeof(p_controllers) is distinct from 'object'
      then 'feature_flag_invalid_definition_controllers'
    when (select pg_catalog.array_agg(key order by key) from pg_catalog.jsonb_object_keys(p_controllers) as key)
        is distinct from
        (select pg_catalog.array_agg(scope order by scope) from pg_catalog.unnest(p_scopes) as scope)
      or p_controllers -> 'platform' is distinct from '"platform-admin"'::jsonb
      or (
        'workspace' = any (p_scopes)
        and p_controllers -> 'workspace' not in ('"platform-admin"'::jsonb, '"workspace-admin"'::jsonb)
      )
      or (
        'user' = any (p_scopes)
        and p_controllers -> 'user' not in ('"platform-admin"'::jsonb, '"self"'::jsonb)
      )
      then 'feature_flag_invalid_definition_controllers'
    when p_delegate is not null
      and (p_delegate <> 'workspace' or not ('workspace' = any (p_scopes)))
      then 'feature_flag_invalid_definition_delegate'
    else null
  end;
$flag$;

comment on function private.feature_flag_definition_error(text, text, text[], jsonb, text) is
  'First violation of a runtime flag definition, or null. Mirrors validateRuntimeDefinition in @tuturuuu/feature-flags.';

-- tuturuuu: no-grant (internal)
revoke all on function private.feature_flag_definition_error(text, text, text[], jsonb, text)
  from public, anon, authenticated, service_role;

create table private.feature_flag_definitions (
  flag_key text primary key,
  kind text not null,
  scopes text[] not null,
  controllers jsonb not null,
  delegate text,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint feature_flag_definitions_shape_check check (
    private.feature_flag_definition_error(flag_key, kind, scopes, controllers, delegate) is null
  )
);

comment on table private.feature_flag_definitions is
  'Runtime block of each catalog runtime flag, written only by private.feature_flag_sync_definitions from deployed code.';

create table private.feature_flag_rules (
  flag_key text not null
    references private.feature_flag_definitions (flag_key) on delete restrict,
  scope text not null,
  subject_id uuid,
  environment text not null,
  mode text,
  percentage smallint,
  allow_workspace_ids uuid[],
  allow_user_ids uuid[],
  revision bigint not null,
  updated_by uuid not null,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint feature_flag_rules_identity_key
    unique nulls not distinct (flag_key, scope, subject_id, environment),
  constraint feature_flag_rules_environment_check
    check (environment in ('development', 'production')),
  constraint feature_flag_rules_shape_check check (
    private.feature_flag_rule_shape_error(
      scope, subject_id, mode, percentage, allow_workspace_ids, allow_user_ids
    ) is null
  ),
  constraint feature_flag_rules_revision_check check (revision > 0)
);

comment on table private.feature_flag_rules is
  'One rule per flag, scope, subject and environment. A null mode is an unset rule that keeps its revision, so revisions never restart.';

create table private.feature_flag_audit (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  operation_id uuid not null,
  actor_id uuid not null,
  flag_key text not null
    references private.feature_flag_definitions (flag_key) on delete restrict,
  scope text not null,
  subject_id uuid,
  environment text not null,
  old_rule jsonb,
  new_rule jsonb,
  old_revision bigint not null,
  new_revision bigint not null,
  reason text not null,
  client text not null,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint feature_flag_audit_operation_key unique (operation_id),
  constraint feature_flag_audit_scope_check
    check (scope in ('platform', 'workspace', 'user')),
  constraint feature_flag_audit_environment_check
    check (environment in ('development', 'production')),
  constraint feature_flag_audit_reason_check
    check (pg_catalog.char_length(reason) between 1 and 500),
  constraint feature_flag_audit_client_check
    check (client in ('admin-ui', 'workspace-ui', 'ttr', 'migration')),
  constraint feature_flag_audit_revision_check check (
    old_revision >= 0 and new_revision = old_revision + 1
  )
);

comment on table private.feature_flag_audit is
  'Append-only rule mutation receipt with the old and new rule. Not a cryptographic tamper-evidence log.';

alter table private.feature_flag_definitions enable row level security;
alter table private.feature_flag_rules enable row level security;
alter table private.feature_flag_audit enable row level security;

create policy feature_flag_definitions_deny_client on private.feature_flag_definitions
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy feature_flag_rules_deny_client on private.feature_flag_rules
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy feature_flag_audit_deny_client on private.feature_flag_audit
  as restrictive for all to anon, authenticated using (false) with check (false);

revoke all on table private.feature_flag_definitions
  from public, anon, authenticated, service_role;
revoke all on table private.feature_flag_rules
  from public, anon, authenticated, service_role;
revoke all on table private.feature_flag_audit
  from public, anon, authenticated, service_role;

create function private.feature_flag_guard_write()
returns trigger language plpgsql
set search_path = pg_catalog, pg_temp
as $flag$
begin
  if tg_op = 'DELETE' or tg_op = 'TRUNCATE' then
    raise exception 'feature_flag_store_delete' using errcode = '42501';
  end if;
  if tg_table_name = 'feature_flag_audit' and tg_op = 'UPDATE' then
    raise exception 'feature_flag_audit_immutable' using errcode = '42501';
  end if;
  if pg_catalog.current_setting('feature_flags.entrypoint', true)
    is distinct from tg_argv[0]
  then
    raise exception 'feature_flag_direct_write' using errcode = '42501';
  end if;
  return new;
end;
$flag$;

comment on function private.feature_flag_guard_write() is
  'Rejects deletes, audit updates and writes outside the entrypoint named by the trigger argument.';

-- tuturuuu: no-grant (trigger)
revoke all on function private.feature_flag_guard_write()
  from public, anon, authenticated, service_role;

create trigger feature_flag_definitions_guard
  before insert or update or delete on private.feature_flag_definitions
  for each row execute function private.feature_flag_guard_write('sync_definitions');
create trigger feature_flag_rules_guard
  before insert or update or delete on private.feature_flag_rules
  for each row execute function private.feature_flag_guard_write('mutate_rule');
create trigger feature_flag_audit_guard
  before insert or update or delete on private.feature_flag_audit
  for each row execute function private.feature_flag_guard_write('mutate_rule');
create trigger feature_flag_definitions_truncate_guard
  before truncate on private.feature_flag_definitions
  for each statement execute function private.feature_flag_guard_write('none');
create trigger feature_flag_rules_truncate_guard
  before truncate on private.feature_flag_rules
  for each statement execute function private.feature_flag_guard_write('none');
create trigger feature_flag_audit_truncate_guard
  before truncate on private.feature_flag_audit
  for each statement execute function private.feature_flag_guard_write('none');

create function private.feature_flag_require_root(
  p_actor uuid, p_permissions text[]
)
returns void language plpgsql stable
set search_path = pg_catalog, pg_temp
as $flag$
begin
  if p_actor is null or not exists (
    select 1
    from pg_catalog.unnest(p_permissions) as permission
    where public.has_workspace_permission(
      '00000000-0000-0000-0000-000000000000'::uuid, p_actor, permission
    ) is true
  ) then
    raise exception 'feature_flag_denied' using errcode = '42501';
  end if;
end;
$flag$;

comment on function private.feature_flag_require_root(uuid, text[]) is
  'Raises unless the actor holds one of the root-workspace permissions via public.has_workspace_permission.';

-- tuturuuu: no-grant (internal)
revoke all on function private.feature_flag_require_root(uuid, text[])
  from public, anon, authenticated, service_role;

create function private.feature_flag_rule_json(
  p_mode text, p_percentage integer, p_allow_workspace_ids uuid[],
  p_allow_user_ids uuid[]
)
returns jsonb language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $flag$
  select case when p_mode is null then null else pg_catalog.jsonb_build_object(
    'mode', p_mode,
    'percentage', p_percentage,
    'allowWorkspaceIds', pg_catalog.to_jsonb(p_allow_workspace_ids),
    'allowUserIds', pg_catalog.to_jsonb(p_allow_user_ids)
  ) end;
$flag$;

-- tuturuuu: no-grant (internal)
revoke all on function private.feature_flag_rule_json(text, integer, uuid[], uuid[])
  from public, anon, authenticated, service_role;

create function private.feature_flag_sync_definitions(p_definitions jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '5s'
as $flag$
declare
  v_role text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  v_item jsonb;
  v_key text;
  v_scopes text[];
  v_error text;
  v_seen text[] := '{}'::text[];
  v_rows integer;
  v_changed integer := 0;
begin
  if v_role is not null and v_role is distinct from 'service_role' then
    raise exception 'feature_flag_denied' using errcode = '42501';
  end if;
  if p_definitions is null
    or pg_catalog.jsonb_typeof(p_definitions) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_definitions) > 500
  then
    raise exception 'feature_flag_invalid_definitions' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('feature_flag_definitions', 0));
  perform pg_catalog.set_config('feature_flags.entrypoint', 'sync_definitions', true);

  for v_item in select value from pg_catalog.jsonb_array_elements(p_definitions) loop
    if pg_catalog.jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'feature_flag_invalid_definitions' using errcode = '22023';
    end if;
    if exists (
        select 1 from pg_catalog.jsonb_object_keys(v_item) as field
        where field not in ('key', 'kind', 'scopes', 'controllers', 'delegate')
      )
      or pg_catalog.jsonb_typeof(v_item -> 'key') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_item -> 'kind') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_item -> 'scopes') is distinct from 'array'
      or coalesce(pg_catalog.jsonb_typeof(v_item -> 'delegate'), 'null')
        not in ('null', 'string')
    then
      raise exception 'feature_flag_invalid_definitions' using errcode = '22023';
    end if;
    if exists (
      select 1 from pg_catalog.jsonb_array_elements(v_item -> 'scopes') as scope
      where pg_catalog.jsonb_typeof(scope) is distinct from 'string'
    ) then
      raise exception 'feature_flag_invalid_definitions' using errcode = '22023';
    end if;

    v_key := v_item ->> 'key';
    v_scopes := array(select pg_catalog.jsonb_array_elements_text(v_item -> 'scopes'));
    v_error := private.feature_flag_definition_error(
      v_key, v_item ->> 'kind', v_scopes, v_item -> 'controllers', v_item ->> 'delegate'
    );
    if v_error is not null then
      raise exception '%', v_error using errcode = '22023', detail = v_key;
    end if;
    if v_key = any (v_seen) then
      raise exception 'feature_flag_duplicate_definition'
        using errcode = '22023', detail = v_key;
    end if;
    v_seen := v_seen || v_key;

    perform 1 from private.feature_flag_definitions where flag_key = v_key for update;
    if exists (
      select 1 from private.feature_flag_rules
      where flag_key = v_key and mode is not null and not (scope = any (v_scopes))
    ) then
      raise exception 'feature_flag_definition_orphans_rules'
        using errcode = '23503', detail = v_key;
    end if;

    insert into private.feature_flag_definitions as current (
      flag_key, kind, scopes, controllers, delegate, updated_at
    ) values (
      v_key, v_item ->> 'kind', v_scopes, v_item -> 'controllers',
      v_item ->> 'delegate', pg_catalog.clock_timestamp()
    )
    on conflict (flag_key) do update
      set kind = excluded.kind, scopes = excluded.scopes,
          controllers = excluded.controllers, delegate = excluded.delegate,
          updated_at = excluded.updated_at
      where (current.kind, current.scopes, current.controllers, current.delegate)
        is distinct from
        (excluded.kind, excluded.scopes, excluded.controllers, excluded.delegate);
    get diagnostics v_rows = row_count;
    v_changed := v_changed + v_rows;
  end loop;
  perform pg_catalog.set_config('feature_flags.entrypoint', '', true);

  return pg_catalog.jsonb_build_object('status', 'synced',
    'definitions', pg_catalog.cardinality(v_seen), 'changed', v_changed);
end;
$flag$;

comment on function private.feature_flag_sync_definitions(jsonb) is
  'Upserts runtime flag definitions from deployed code. Refuses malformed or duplicate entries and a scope removal that would orphan a stored rule.';

revoke all on function private.feature_flag_sync_definitions(jsonb)
  from public, anon, authenticated;
grant execute on function private.feature_flag_sync_definitions(jsonb)
  to service_role;

create function private.feature_flag_mutate_rule(
  p_actor uuid, p_operation_id uuid, p_flag_key text, p_environment text,
  p_scope text, p_subject_id uuid, p_mode text, p_percentage integer,
  p_allow_workspace_ids uuid[], p_allow_user_ids uuid[],
  p_expected_revision bigint, p_reason text, p_client text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '5s'
as $flag$
declare
  v_def private.feature_flag_definitions%rowtype;
  v_rule private.feature_flag_rules%rowtype;
  v_audit private.feature_flag_audit%rowtype;
  v_error text;
  v_controller text;
  v_new jsonb := private.feature_flag_rule_json(
    p_mode, p_percentage, p_allow_workspace_ids, p_allow_user_ids
  );
  v_old jsonb;
  v_old_revision bigint;
begin
  if p_actor is null then
    raise exception 'feature_flag_denied' using errcode = '42501';
  end if;
  if p_operation_id is null then
    raise exception 'feature_flag_invalid_operation' using errcode = '22023';
  end if;
  if p_environment is null or p_environment not in ('development', 'production') then
    raise exception 'feature_flag_unknown_environment' using errcode = '22023';
  end if;
  select * into v_def from private.feature_flag_definitions
  where flag_key = p_flag_key for share;
  if not found then
    raise exception 'feature_flag_unknown_flag' using errcode = '22023';
  end if;
  if p_scope is null or p_scope not in ('platform', 'workspace', 'user') then
    raise exception 'feature_flag_invalid_scope' using errcode = '22023';
  end if;
  if not (p_scope = any (v_def.scopes)) then
    raise exception 'feature_flag_scope_not_declared' using errcode = '22023';
  end if;
  v_error := private.feature_flag_rule_shape_error(
    p_scope, p_subject_id, p_mode, p_percentage, p_allow_workspace_ids, p_allow_user_ids
  );
  if v_error is not null then
    raise exception '%', v_error using errcode = '22023';
  end if;
  if p_reason is null or p_reason !~ '\S' or pg_catalog.char_length(p_reason) > 500 then
    raise exception 'feature_flag_invalid_reason' using errcode = '22023';
  end if;
  if p_client is null or p_client not in ('admin-ui', 'workspace-ui', 'ttr', 'migration') then
    raise exception 'feature_flag_invalid_client' using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'feature_flag_invalid_revision' using errcode = '22023';
  end if;

  v_controller := v_def.controllers ->> p_scope;
  if v_controller = 'self' then
    if p_mode is not null and p_mode <> 'off' then
      raise exception 'feature_flag_self_mode' using errcode = '42501';
    end if;
    if p_subject_id is distinct from p_actor then
      raise exception 'feature_flag_denied' using errcode = '42501';
    end if;
  elsif v_controller = 'workspace-admin' then
    if public.has_workspace_permission(p_subject_id, p_actor, 'manage_workspace_settings')
      is distinct from true
    then
      raise exception 'feature_flag_denied' using errcode = '42501';
    end if;
  elsif v_controller = 'platform-admin' then
    perform private.feature_flag_require_root(p_actor, array['manage_feature_flags']::text[]);
  else
    raise exception 'feature_flag_denied' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.concat_ws(':', 'feature_flag_rule', p_flag_key, p_environment,
      p_scope, p_subject_id::text),
    0
  ));

  select * into v_audit from private.feature_flag_audit where operation_id = p_operation_id;
  if found then
    return pg_catalog.jsonb_build_object(
      'status', 'replayed', 'replayed', true,
      'matchesRequest', v_audit.flag_key = p_flag_key
        and v_audit.environment = p_environment and v_audit.scope = p_scope
        and v_audit.subject_id is not distinct from p_subject_id
        and v_audit.new_rule is not distinct from v_new,
      'operationId', v_audit.operation_id, 'flagKey', v_audit.flag_key,
      'environment', v_audit.environment, 'scope', v_audit.scope,
      'subjectId', v_audit.subject_id, 'oldRule', v_audit.old_rule,
      'newRule', v_audit.new_rule, 'oldRevision', v_audit.old_revision,
      'newRevision', v_audit.new_revision, 'revision', v_audit.new_revision,
      'storage', false
    );
  end if;

  select * into v_rule from private.feature_flag_rules
  where flag_key = p_flag_key
    and environment = p_environment
    and scope = p_scope
    and subject_id is not distinct from p_subject_id
  for update;
  v_old_revision := coalesce(v_rule.revision, 0);
  v_old := private.feature_flag_rule_json(
    v_rule.mode, v_rule.percentage, v_rule.allow_workspace_ids, v_rule.allow_user_ids
  );
  if v_old_revision <> p_expected_revision then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict', 'flagKey', p_flag_key, 'environment', p_environment,
      'scope', p_scope, 'subjectId', p_subject_id,
      'revision', v_old_revision, 'storage', false
    );
  end if;
  if v_old is not distinct from v_new then
    return pg_catalog.jsonb_build_object(
      'status', 'noop', 'flagKey', p_flag_key, 'environment', p_environment,
      'scope', p_scope, 'subjectId', p_subject_id, 'rule', v_new,
      'revision', v_old_revision, 'storage', false
    );
  end if;

  perform pg_catalog.set_config('feature_flags.entrypoint', 'mutate_rule', true);
  insert into private.feature_flag_rules as current (
    flag_key, scope, subject_id, environment, mode, percentage,
    allow_workspace_ids, allow_user_ids, revision, updated_by, updated_at
  ) values (
    p_flag_key, p_scope, p_subject_id, p_environment, p_mode, p_percentage,
    p_allow_workspace_ids, p_allow_user_ids, v_old_revision + 1, p_actor,
    pg_catalog.clock_timestamp()
  )
  on conflict on constraint feature_flag_rules_identity_key do update
    set mode = excluded.mode,
        percentage = excluded.percentage,
        allow_workspace_ids = excluded.allow_workspace_ids,
        allow_user_ids = excluded.allow_user_ids,
        revision = excluded.revision,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    where current.revision = v_old_revision;

  insert into private.feature_flag_audit (
    operation_id, actor_id, flag_key, scope, subject_id, environment,
    old_rule, new_rule, old_revision, new_revision, reason, client, occurred_at
  ) values (
    p_operation_id, p_actor, p_flag_key, p_scope, p_subject_id, p_environment,
    v_old, v_new, v_old_revision, v_old_revision + 1, p_reason, p_client,
    pg_catalog.clock_timestamp()
  );
  perform pg_catalog.set_config('feature_flags.entrypoint', '', true);

  return pg_catalog.jsonb_build_object(
    'status', 'applied', 'replayed', false, 'matchesRequest', true,
    'operationId', p_operation_id, 'flagKey', p_flag_key,
    'environment', p_environment, 'scope', p_scope, 'subjectId', p_subject_id,
    'oldRule', v_old, 'newRule', v_new, 'oldRevision', v_old_revision,
    'newRevision', v_old_revision + 1, 'revision', v_old_revision + 1,
    'storage', true
  );
end;
$flag$;

comment on function private.feature_flag_mutate_rule(uuid, uuid, text, text, text, uuid, text, integer, uuid[], uuid[], bigint, text, text) is
  'Validates, authorizes by the scope controller, compares the expected revision, writes or unsets one rule and appends its audit row in this transaction. A null mode unsets the rule.';

revoke all on function private.feature_flag_mutate_rule(uuid, uuid, text, text, text, uuid, text, integer, uuid[], uuid[], bigint, text, text)
  from public, anon, authenticated;
grant execute on function private.feature_flag_mutate_rule(uuid, uuid, text, text, text, uuid, text, integer, uuid[], uuid[], bigint, text, text)
  to service_role;

create function private.feature_flag_read_snapshot(p_environment text)
returns jsonb language plpgsql security definer stable
set search_path = pg_catalog, pg_temp
as $flag$
declare
  v_role text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  v_rules jsonb;
begin
  if v_role is not null and v_role is distinct from 'service_role' then
    raise exception 'feature_flag_denied' using errcode = '42501';
  end if;
  if p_environment is null or p_environment not in ('development', 'production') then
    raise exception 'feature_flag_unknown_environment' using errcode = '22023';
  end if;
  select coalesce(pg_catalog.jsonb_agg(item order by flag_key, scope, subject_id nulls first), '[]'::jsonb)
    into v_rules
  from (
    select r.flag_key, r.scope, r.subject_id,
      pg_catalog.jsonb_strip_nulls(private.feature_flag_rule_json(
        r.mode, r.percentage, r.allow_workspace_ids, r.allow_user_ids
      )) || pg_catalog.jsonb_build_object(
        'flagKey', r.flag_key, 'scope', r.scope, 'subjectId', r.subject_id,
        'revision', r.revision
      ) as item
    from private.feature_flag_rules as r
    where r.environment = p_environment and r.mode is not null
  ) as live;
  return pg_catalog.jsonb_build_object(
    'environment', p_environment,
    'version', pg_catalog.md5(v_rules::text),
    'rules', v_rules
  );
end;
$flag$;

comment on function private.feature_flag_read_snapshot(text) is
  'Service-role rule snapshot for one server-selected environment. version is a digest of the returned rules for snapshot caches.';

revoke all on function private.feature_flag_read_snapshot(text)
  from public, anon, authenticated;
grant execute on function private.feature_flag_read_snapshot(text)
  to service_role;

create function private.feature_flag_read_rules(
  p_actor uuid, p_flag_key text, p_environment text
)
returns jsonb language plpgsql security definer stable
set search_path = pg_catalog, pg_temp
as $flag$
begin
  perform private.feature_flag_require_root(
    p_actor, array['view_infrastructure', 'manage_feature_flags']::text[]
  );
  if p_environment is null or p_environment not in ('development', 'production') then
    raise exception 'feature_flag_unknown_environment' using errcode = '22023';
  end if;
  return pg_catalog.jsonb_build_object('rules', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'flagKey', flag_key, 'scope', scope, 'subjectId', subject_id,
        'environment', environment,
        'rule', private.feature_flag_rule_json(
          mode, percentage, allow_workspace_ids, allow_user_ids
        ),
        'revision', revision, 'updatedBy', updated_by, 'updatedAt', updated_at
      ) order by flag_key, scope, subject_id nulls first)
    from private.feature_flag_rules
    where environment = p_environment
      and (p_flag_key is null or flag_key = p_flag_key)
  ), '[]'::jsonb));
end;
$flag$;

comment on function private.feature_flag_read_rules(uuid, text, text) is
  'Stored rules, including unset rules and their revisions, for root flag viewers and managers.';

revoke all on function private.feature_flag_read_rules(uuid, text, text)
  from public, anon, authenticated;
grant execute on function private.feature_flag_read_rules(uuid, text, text)
  to service_role;

create function private.feature_flag_read_audit(
  p_actor uuid, p_limit integer default 50, p_before timestamptz default null
)
returns jsonb language plpgsql security definer stable
set search_path = pg_catalog, pg_temp
as $flag$
begin
  perform private.feature_flag_require_root(
    p_actor, array['view_infrastructure', 'manage_feature_flags']::text[]
  );
  return pg_catalog.jsonb_build_object('rows', coalesce((
    select pg_catalog.jsonb_agg(item order by occurred_at desc, id desc)
    from (
      select id, occurred_at, pg_catalog.jsonb_build_object(
        'operationId', operation_id, 'actorId', actor_id, 'flagKey', flag_key,
        'scope', scope, 'subjectId', subject_id, 'environment', environment,
        'oldRule', old_rule, 'newRule', new_rule, 'oldRevision', old_revision,
        'newRevision', new_revision, 'reason', reason, 'client', client,
        'occurredAt', occurred_at
      ) as item
      from private.feature_flag_audit
      where p_before is null or occurred_at < p_before
      order by occurred_at desc, id desc
      limit least(greatest(coalesce(p_limit, 50), 1), 100)
    ) as page
  ), '[]'::jsonb));
end;
$flag$;

comment on function private.feature_flag_read_audit(uuid, integer, timestamptz) is
  'Newest-first rule audit page (1 to 100 rows) for root flag viewers and managers.';

revoke all on function private.feature_flag_read_audit(uuid, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function private.feature_flag_read_audit(uuid, integer, timestamptz)
  to service_role;
