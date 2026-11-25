create or replace function private.feature_flag_mutate_rule(
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
  v_rows integer;
begin
  perform private.feature_flag_require_service_role();
  -- Serializes every write with private.feature_flag_erase_subject, which
  -- holds this key exclusively, so an erasure never races an allow-list write.
  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('feature_flag_erasure', 0));
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
    -- An operation id belongs to one actor and one rule identity.
    if v_audit.actor_id is distinct from p_actor or v_audit.flag_key <> p_flag_key
      or v_audit.environment <> p_environment or v_audit.scope <> p_scope
      or v_audit.subject_id is distinct from p_subject_id
    then
      raise exception 'feature_flag_operation_conflict' using errcode = '22023';
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'replayed', 'replayed', true,
      'matchesRequest', v_audit.new_rule is not distinct from v_new,
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

  -- Caps on workspace and user rules that can enable a flag, per flag and
  -- environment: 50000 in all and, for a tenant controller, 200 last written by
  -- one actor. An off rule only narrows and is never capped, so opt-outs and
  -- workspace kills keep working while a cap is full.
  if p_scope <> 'platform' and p_mode <> 'off'
    and (v_rule.mode is null or v_rule.mode = 'off')
  then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      pg_catalog.concat_ws(':', 'feature_flag_rule_cap', p_flag_key, p_environment), 0
    ));
    if (
      select pg_catalog.count(*) from private.feature_flag_rules
      where flag_key = p_flag_key and environment = p_environment
        and scope <> 'platform' and mode <> 'off'
    ) >= 50000 then
      raise exception 'feature_flag_rule_limit' using errcode = '54000';
    end if;
    if v_controller <> 'platform-admin' and (
      select pg_catalog.count(*) from private.feature_flag_rules
      where flag_key = p_flag_key and environment = p_environment
        and scope <> 'platform' and mode <> 'off' and updated_by = p_actor
    ) >= 200 then
      raise exception 'feature_flag_actor_rule_limit' using errcode = '54000';
    end if;
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
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'feature_flag_write_lost' using errcode = '40001';
  end if;

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

create or replace function private.feature_flag_erase_subject(p_scope text, p_subject_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '5s'
as $flag$
declare
  v_rule private.feature_flag_rules%rowtype;
  v_field text := case when p_scope = 'user' then 'allowUserIds' else 'allowWorkspaceIds' end;
  v_deleted integer := 0;
  v_stripped integer := 0;
  v_anonymized integer := 0;
begin
  perform private.feature_flag_require_service_role();
  if p_subject_id is null or p_scope is null or p_scope not in ('workspace', 'user') then
    raise exception 'feature_flag_invalid_subject' using errcode = '22023';
  end if;
  -- Waits for in-flight rule writes, which hold this key shared, and blocks new
  -- ones until the erasure commits.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('feature_flag_erasure', 0));
  perform pg_catalog.set_config('feature_flags.entrypoint', 'erase_subject', true);

  -- The subject's own rules are deleted; a user rule's audit row names no one.
  for v_rule in
    delete from private.feature_flag_rules
    where scope = p_scope and subject_id = p_subject_id
    returning *
  loop
    insert into private.feature_flag_audit (
      operation_id, actor_id, flag_key, scope, subject_id, environment, old_rule,
      new_rule, old_revision, new_revision, reason, client
    ) values (
      pg_catalog.gen_random_uuid(), null, v_rule.flag_key, v_rule.scope,
      case when p_scope = 'user' then null else p_subject_id end, v_rule.environment,
      private.feature_flag_rule_json(v_rule.mode, v_rule.percentage,
        v_rule.allow_workspace_ids, v_rule.allow_user_ids),
      null, v_rule.revision, v_rule.revision + 1, 'Subject erasure', 'erasure'
    );
    v_deleted := v_deleted + 1;
  end loop;

  -- The subject leaves every allow-list; the old rule records an erased entry.
  for v_rule in
    update private.feature_flag_rules
      set allow_user_ids = case when p_scope = 'user'
            then pg_catalog.array_remove(allow_user_ids, p_subject_id) else allow_user_ids end,
          allow_workspace_ids = case when p_scope = 'workspace'
            then pg_catalog.array_remove(allow_workspace_ids, p_subject_id)
            else allow_workspace_ids end,
          revision = revision + 1, updated_by = null,
          updated_at = pg_catalog.clock_timestamp()
    where (p_scope = 'user' and p_subject_id = any (allow_user_ids))
      or (p_scope = 'workspace' and p_subject_id = any (allow_workspace_ids))
    returning *
  loop
    insert into private.feature_flag_audit (
      operation_id, actor_id, flag_key, scope, subject_id, environment, old_rule,
      new_rule, old_revision, new_revision, reason, client
    ) values (
      pg_catalog.gen_random_uuid(), null, v_rule.flag_key, v_rule.scope,
      v_rule.subject_id, v_rule.environment,
      private.feature_flag_rule_json(v_rule.mode, v_rule.percentage,
        v_rule.allow_workspace_ids, v_rule.allow_user_ids)
        || pg_catalog.jsonb_build_object(v_field, coalesce(pg_catalog.to_jsonb(
          case when p_scope = 'user' then v_rule.allow_user_ids
            else v_rule.allow_workspace_ids end), '[]'::jsonb) || '["erased"]'::jsonb),
      private.feature_flag_rule_json(v_rule.mode, v_rule.percentage,
        v_rule.allow_workspace_ids, v_rule.allow_user_ids),
      v_rule.revision - 1, v_rule.revision, 'Subject erasure', 'erasure'
    );
    v_stripped := v_stripped + 1;
  end loop;

  -- A person's id leaves rule authorship and every audit row.
  if p_scope = 'user' then
    update private.feature_flag_rules set updated_by = null where updated_by = p_subject_id;
    update private.feature_flag_audit
      set actor_id = case when actor_id = p_subject_id then null else actor_id end,
          subject_id = case when scope = 'user' and subject_id = p_subject_id
            then null else subject_id end,
          old_rule = private.feature_flag_erase_json(old_rule, 'allowUserIds', p_subject_id::text),
          new_rule = private.feature_flag_erase_json(new_rule, 'allowUserIds', p_subject_id::text)
    where actor_id = p_subject_id
      or (scope = 'user' and subject_id = p_subject_id)
      or old_rule -> 'allowUserIds' @> pg_catalog.jsonb_build_array(p_subject_id::text)
      or new_rule -> 'allowUserIds' @> pg_catalog.jsonb_build_array(p_subject_id::text);
    get diagnostics v_anonymized = row_count;
  end if;
  perform pg_catalog.set_config('feature_flags.entrypoint', '', true);

  return pg_catalog.jsonb_build_object('status', 'erased', 'deletedRules', v_deleted,
    'strippedRules', v_stripped, 'anonymizedAudit', v_anonymized);
end;
$flag$;

comment on function private.feature_flag_erase_subject(text, uuid) is
  'Erases a user or workspace from the rule store: deletes its rules, removes it from allow-lists with an erasure audit row, and for a user nulls its ids in rule authorship and audit. Idempotent.';

revoke all on function private.feature_flag_erase_subject(text, uuid)
  from public, anon, authenticated;
grant execute on function private.feature_flag_erase_subject(text, uuid)
  to service_role;

drop index private.feature_flag_audit_subject_idx;
drop index private.feature_flag_audit_actor_idx;
drop index private.feature_flag_rules_keyset_idx;
alter table private.feature_flag_rules drop column enabled_by;
