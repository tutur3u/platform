-- Root-workspace permission to write platform-controlled runtime feature flag
-- rules, and the definition sync, read and erasure RPCs of the rule store from
-- 20261125030000_feature_flag_rules.sql. has_workspace_permission reads the
-- permission as text at run time, so this transaction never uses the new
-- enum value. The enum value cannot be removed; the rollback drops only the
-- functions.
-- Rollback: apps/database/rollbacks/20261125030100_manage_feature_flags_permission.rollback.sql

set lock_timeout = '5s';
set statement_timeout = '60s';

alter type public.workspace_role_permission
  add value if not exists 'manage_feature_flags';

create function private.feature_flag_sync_definitions(
  p_definitions jsonb, p_acknowledge_widening boolean default false
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '5s'
as $flag$
declare
  v_item jsonb;
  v_key text;
  v_scopes text[];
  v_error text;
  v_seen text[] := '{}'::text[];
  v_changed integer := 0;
  v_old private.feature_flag_definitions%rowtype;
  v_old_json jsonb;
  v_new_json jsonb;
  v_widened boolean;
begin
  perform private.feature_flag_require_service_role();
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

    v_new_json := pg_catalog.jsonb_build_object('kind', v_item ->> 'kind',
      'scopes', pg_catalog.to_jsonb(v_scopes), 'controllers', v_item -> 'controllers',
      'delegate', pg_catalog.to_jsonb(v_item ->> 'delegate'));
    select * into v_old from private.feature_flag_definitions where flag_key = v_key for update;
    v_old_json := case when found then pg_catalog.jsonb_build_object('kind', v_old.kind,
      'scopes', pg_catalog.to_jsonb(v_old.scopes), 'controllers', v_old.controllers,
      'delegate', pg_catalog.to_jsonb(v_old.delegate)) end;
    continue when v_old_json is not distinct from v_new_json;

    if exists (
      select 1 from private.feature_flag_rules
      where flag_key = v_key and mode is not null and not (scope = any (v_scopes))
    ) then
      raise exception 'feature_flag_definition_orphans_rules'
        using errcode = '23503', detail = v_key;
    end if;
    -- Handing a scope with live rules from platform admins to workspace admins
    -- or to users, or newly delegating it, needs an explicit acknowledgement.
    v_widened := v_old_json is not null and exists (
      select 1 from private.feature_flag_rules as r
      where r.flag_key = v_key and r.mode is not null and r.scope <> 'platform'
        and (
          (v_old.controllers ->> r.scope = 'platform-admin'
            and v_item -> 'controllers' ->> r.scope in ('workspace-admin', 'self'))
          or (r.scope = 'workspace' and v_old.delegate is null
            and v_item ->> 'delegate' = 'workspace')
        )
    );
    if v_widened and p_acknowledge_widening is not true then
      raise exception 'feature_flag_definition_widens_control'
        using errcode = '42501', detail = v_key;
    end if;

    if v_old_json is null then
      insert into private.feature_flag_definitions (flag_key, kind, scopes, controllers, delegate)
      values (v_key, v_item ->> 'kind', v_scopes, v_item -> 'controllers', v_item ->> 'delegate');
    else
      update private.feature_flag_definitions
        set kind = v_item ->> 'kind', scopes = v_scopes, controllers = v_item -> 'controllers',
            delegate = v_item ->> 'delegate', updated_at = pg_catalog.clock_timestamp()
      where flag_key = v_key;
    end if;
    insert into private.feature_flag_definition_audit (
      flag_key, old_definition, new_definition, acknowledged_widening
    ) values (v_key, v_old_json, v_new_json, v_widened);
    v_changed := v_changed + 1;
  end loop;
  perform pg_catalog.set_config('feature_flags.entrypoint', '', true);

  return pg_catalog.jsonb_build_object('status', 'synced',
    'definitions', pg_catalog.cardinality(v_seen), 'changed', v_changed);
end;
$flag$;

comment on function private.feature_flag_sync_definitions(jsonb, boolean) is
  'Upserts runtime flag definitions from deployed code and audits each change. Refuses malformed or duplicate entries, a scope removal that would orphan a live rule, and an unacknowledged control widening over live rules.';

revoke all on function private.feature_flag_sync_definitions(jsonb, boolean)
  from public, anon, authenticated;
grant execute on function private.feature_flag_sync_definitions(jsonb, boolean)
  to service_role;

create function private.feature_flag_live_rule_json(p_rule private.feature_flag_rules)
returns jsonb language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $flag$
  select pg_catalog.jsonb_strip_nulls(private.feature_flag_rule_json(
    p_rule.mode, p_rule.percentage, p_rule.allow_workspace_ids, p_rule.allow_user_ids
  )) || pg_catalog.jsonb_build_object(
    'flagKey', p_rule.flag_key, 'scope', p_rule.scope,
    'subjectId', p_rule.subject_id, 'revision', p_rule.revision
  );
$flag$;

-- tuturuuu: no-grant (internal)
revoke all on function private.feature_flag_live_rule_json(private.feature_flag_rules)
  from public, anon, authenticated, service_role;

create function private.feature_flag_read_snapshot(p_environment text)
returns jsonb language plpgsql security definer stable
set search_path = pg_catalog, pg_temp
as $flag$
declare
  v_rules jsonb;
begin
  perform private.feature_flag_require_service_role();
  if p_environment is null or p_environment not in ('development', 'production') then
    raise exception 'feature_flag_unknown_environment' using errcode = '22023';
  end if;
  select coalesce(pg_catalog.jsonb_agg(
      private.feature_flag_live_rule_json(r) order by r.flag_key
    ), '[]'::jsonb)
    into v_rules
  from private.feature_flag_rules as r
  where r.environment = p_environment and r.scope = 'platform' and r.mode is not null;
  return pg_catalog.jsonb_build_object(
    'environment', p_environment,
    'version', pg_catalog.md5(v_rules::text),
    'rules', v_rules
  );
end;
$flag$;

comment on function private.feature_flag_read_snapshot(text) is
  'Service-role platform rules for one server-selected environment, with a content digest for snapshot caches. Workspace and user rules come from feature_flag_read_subject_rules.';

revoke all on function private.feature_flag_read_snapshot(text)
  from public, anon, authenticated;
grant execute on function private.feature_flag_read_snapshot(text)
  to service_role;

create function private.feature_flag_read_subject_rules(
  p_environment text, p_workspace_id uuid, p_user_id uuid
)
returns jsonb language plpgsql security definer stable
set search_path = pg_catalog, pg_temp
as $flag$
begin
  perform private.feature_flag_require_service_role();
  if p_environment is null or p_environment not in ('development', 'production') then
    raise exception 'feature_flag_unknown_environment' using errcode = '22023';
  end if;
  return pg_catalog.jsonb_build_object('environment', p_environment, 'rules', coalesce((
    select pg_catalog.jsonb_agg(
      private.feature_flag_live_rule_json(r) order by r.flag_key, r.scope
    )
    from private.feature_flag_rules as r
    where r.environment = p_environment and r.mode is not null
      and (
        (r.scope = 'workspace' and r.subject_id = p_workspace_id)
        or (r.scope = 'user' and r.subject_id = p_user_id)
      )
  ), '[]'::jsonb));
end;
$flag$;

comment on function private.feature_flag_read_subject_rules(text, uuid, uuid) is
  'Service-role live workspace and user rules for one request actor: the workspace rules of p_workspace_id and the user rules of p_user_id.';

revoke all on function private.feature_flag_read_subject_rules(text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.feature_flag_read_subject_rules(text, uuid, uuid)
  to service_role;

create function private.feature_flag_read_rules(
  p_actor uuid, p_flag_key text, p_environment text, p_limit integer default 500,
  p_after_flag_key text default null, p_after_scope text default null,
  p_after_subject_id uuid default null
)
returns jsonb language plpgsql security definer stable
set search_path = pg_catalog, pg_temp
as $flag$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 1000);
  v_rules jsonb;
begin
  perform private.feature_flag_require_service_role();
  perform private.feature_flag_require_root(
    p_actor, array['view_infrastructure', 'manage_feature_flags']::text[]
  );
  if p_environment is null or p_environment not in ('development', 'production') then
    raise exception 'feature_flag_unknown_environment' using errcode = '22023';
  end if;
  -- A platform rule has no subject; the nil UUID orders it first in its flag.
  select coalesce(pg_catalog.jsonb_agg(item order by flag_key, scope, subject_key), '[]'::jsonb)
    into v_rules
  from (
    select flag_key, scope,
      coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid) as subject_key,
      pg_catalog.jsonb_build_object(
        'flagKey', flag_key, 'scope', scope, 'subjectId', subject_id,
        'environment', environment,
        'rule', private.feature_flag_rule_json(
          mode, percentage, allow_workspace_ids, allow_user_ids
        ),
        'revision', revision, 'updatedBy', updated_by, 'updatedAt', updated_at
      ) as item
    from private.feature_flag_rules
    where environment = p_environment
      and (p_flag_key is null or flag_key = p_flag_key)
      and (p_after_flag_key is null or (flag_key, scope,
        coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid))
        > (p_after_flag_key, coalesce(p_after_scope, ''),
          coalesce(p_after_subject_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    order by flag_key, scope, subject_key
    limit v_limit
  ) as page;
  return pg_catalog.jsonb_build_object('rules', v_rules, 'nextCursor',
    case when pg_catalog.jsonb_array_length(v_rules) = v_limit then
      pg_catalog.jsonb_build_object('flagKey', v_rules -> -1 -> 'flagKey',
        'scope', v_rules -> -1 -> 'scope', 'subjectId', v_rules -> -1 -> 'subjectId')
    end);
end;
$flag$;

comment on function private.feature_flag_read_rules(uuid, text, text, integer, text, text, uuid) is
  'Page (1 to 1000 rows, default 500) of stored rules, including unset rules and their revisions, for root flag viewers and managers. Pass nextCursor back as the p_after_* arguments until it is null.';

revoke all on function private.feature_flag_read_rules(uuid, text, text, integer, text, text, uuid)
  from public, anon, authenticated;
grant execute on function private.feature_flag_read_rules(uuid, text, text, integer, text, text, uuid)
  to service_role;

create function private.feature_flag_read_audit(
  p_actor uuid, p_limit integer default 50, p_before timestamptz default null,
  p_before_id uuid default null
)
returns jsonb language plpgsql security definer stable
set search_path = pg_catalog, pg_temp
as $flag$
begin
  perform private.feature_flag_require_service_role();
  perform private.feature_flag_require_root(
    p_actor, array['view_infrastructure', 'manage_feature_flags']::text[]
  );
  return pg_catalog.jsonb_build_object('rows', coalesce((
    select pg_catalog.jsonb_agg(item order by occurred_at desc, id desc)
    from (
      select id, occurred_at, pg_catalog.jsonb_build_object(
        'id', id, 'operationId', operation_id, 'actorId', actor_id,
        'flagKey', flag_key, 'scope', scope, 'subjectId', subject_id,
        'environment', environment, 'oldRule', old_rule, 'newRule', new_rule,
        'oldRevision', old_revision, 'newRevision', new_revision,
        'reason', reason, 'client', client, 'occurredAt', occurred_at
      ) as item
      from private.feature_flag_audit
      where p_before is null
        or (p_before_id is null and occurred_at < p_before)
        or (occurred_at, id) < (p_before, p_before_id)
      order by occurred_at desc, id desc
      limit least(greatest(coalesce(p_limit, 50), 1), 100)
    ) as page
  ), '[]'::jsonb));
end;
$flag$;

comment on function private.feature_flag_read_audit(uuid, integer, timestamptz, uuid) is
  'Newest-first rule audit page (1 to 100 rows) for root flag viewers and managers. Pass the last row''s occurredAt and id as the cursor.';

revoke all on function private.feature_flag_read_audit(uuid, integer, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function private.feature_flag_read_audit(uuid, integer, timestamptz, uuid)
  to service_role;

create function private.feature_flag_erase_json(p_rule jsonb, p_field text, p_id text)
returns jsonb language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $flag$
  select case
    when pg_catalog.jsonb_typeof(p_rule -> p_field) = 'array'
      and p_rule -> p_field @> pg_catalog.jsonb_build_array(p_id)
    then pg_catalog.jsonb_set(p_rule, array[p_field], (
      select pg_catalog.jsonb_agg(case
        when item = pg_catalog.to_jsonb(p_id) then '"erased"'::jsonb else item end)
      from pg_catalog.jsonb_array_elements(p_rule -> p_field) as item
    ))
    else p_rule
  end;
$flag$;

-- tuturuuu: no-grant (internal)
revoke all on function private.feature_flag_erase_json(jsonb, text, text)
  from public, anon, authenticated, service_role;

create function private.feature_flag_erase_subject(p_scope text, p_subject_id uuid)
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
