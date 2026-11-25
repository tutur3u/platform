-- Deferred erasure for the runtime feature flag rule store. Deleting an
-- account or a workspace records one intent row (an O(1) insert that takes no
-- erasure lock and scans nothing). A bounded, leased drain then claims intents
-- and runs private.feature_flag_erase_subject for each in its own transaction,
-- so the delete transaction never waits on or scans the rule store. While an
-- intent is pending, rule writes naming that subject are refused.
-- Rollback: apps/database/rollbacks/20261125085000_feature_flag_erasure_intents.rollback.sql

set lock_timeout = '5s';
set statement_timeout = '60s';

create table private.feature_flag_erasure_intents (
  id bigint generated always as identity primary key,
  scope text not null check (scope in ('user', 'workspace')),
  subject_id uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default pg_catalog.clock_timestamp(),
  last_error text check (pg_catalog.char_length(last_error) <= 100),
  constraint feature_flag_erasure_intents_subject_key unique (scope, subject_id)
);

comment on table private.feature_flag_erasure_intents is
  'Pending erasure of one deleted user or workspace from the feature flag rule store. A row exists until the drain erases the subject; next_attempt_at is the lease and the retry backoff.';

create index feature_flag_erasure_intents_due_idx
  on private.feature_flag_erasure_intents (next_attempt_at, id);

alter table private.feature_flag_erasure_intents enable row level security;
create policy feature_flag_erasure_intents_deny_client
  on private.feature_flag_erasure_intents
  as restrictive for all to anon, authenticated using (false) with check (false);
revoke all on table private.feature_flag_erasure_intents
  from public, anon, authenticated, service_role;

create function private.feature_flag_record_erasure_intent()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $flag$
begin
  insert into private.feature_flag_erasure_intents (scope, subject_id)
  values (tg_argv[0], old.id)
  on conflict on constraint feature_flag_erasure_intents_subject_key do nothing;
  return old;
end;
$flag$;

comment on function private.feature_flag_record_erasure_intent() is
  'After a user or workspace delete: records one erasure intent for the rule store drain. Constant work; it never touches the rule store.';

-- tuturuuu: no-grant (trigger)
revoke all on function private.feature_flag_record_erasure_intent()
  from public, anon, authenticated, service_role;

create trigger feature_flag_erasure_intent after delete on auth.users
  for each row execute function private.feature_flag_record_erasure_intent('user');
create trigger feature_flag_erasure_intent after delete on public.workspaces
  for each row execute function private.feature_flag_record_erasure_intent('workspace');

-- Intents already pending refuse the rule writes that name them.
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
  -- A subject whose account or workspace was deleted waits in the erasure
  -- queue; its rules and allow-list entries are being removed, not edited.
  if (p_subject_id is not null and exists (
      select 1 from private.feature_flag_erasure_intents
      where scope = p_scope and subject_id = p_subject_id))
    or (p_allow_workspace_ids is not null and exists (
      select 1 from private.feature_flag_erasure_intents
      where scope = 'workspace' and subject_id = any (p_allow_workspace_ids)))
    or (p_allow_user_ids is not null and exists (
      select 1 from private.feature_flag_erasure_intents
      where scope = 'user' and subject_id = any (p_allow_user_ids)))
  then
    raise exception 'feature_flag_subject_erasing' using errcode = '22023';
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
  -- environment: 50000 in all and, for a tenant controller, 200 first enabled by
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
        and scope <> 'platform' and mode <> 'off' and enabled_by = p_actor
    ) >= 200 then
      raise exception 'feature_flag_actor_rule_limit' using errcode = '54000';
    end if;
  end if;

  perform pg_catalog.set_config('feature_flags.entrypoint', 'mutate_rule', true);
  insert into private.feature_flag_rules as current (
    flag_key, scope, subject_id, environment, mode, percentage,
    allow_workspace_ids, allow_user_ids, revision, updated_by, enabled_by, updated_at
  ) values (
    p_flag_key, p_scope, p_subject_id, p_environment, p_mode, p_percentage,
    p_allow_workspace_ids, p_allow_user_ids, v_old_revision + 1, p_actor,
    case
      when p_mode is null or p_mode = 'off' then null
      when v_rule.mode is null or v_rule.mode = 'off' then p_actor
      else v_rule.enabled_by
    end,
    pg_catalog.clock_timestamp()
  )
  on conflict on constraint feature_flag_rules_identity_key do update
    set mode = excluded.mode,
        percentage = excluded.percentage,
        allow_workspace_ids = excluded.allow_workspace_ids,
        allow_user_ids = excluded.allow_user_ids,
        revision = excluded.revision,
        updated_by = excluded.updated_by,
        enabled_by = excluded.enabled_by,
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

-- Leases up to p_limit (1 to 20) due intents. The lease and the retry backoff
-- are the same timestamp: it moves out by 2^attempts minutes, capped at an hour,
-- so a stalled worker's claim reappears on its own and a failing subject backs off.
create function private.feature_flag_erasure_claim(p_limit integer default 5)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '2s'
as $flag$
declare
  v_claims jsonb;
begin
  perform private.feature_flag_require_service_role();
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception 'feature_flag_invalid_limit' using errcode = '22023';
  end if;
  with due as (
    select id from private.feature_flag_erasure_intents
    where next_attempt_at <= pg_catalog.clock_timestamp()
    order by next_attempt_at, id
    limit p_limit
    for update skip locked
  ), leased as (
    update private.feature_flag_erasure_intents as intent
      set attempts = intent.attempts + 1,
          next_attempt_at = pg_catalog.clock_timestamp()
            + pg_catalog.make_interval(
              mins => least(60, pg_catalog.power(2, least(intent.attempts, 6))::integer))
    from due
    where intent.id = due.id
    returning intent.id, intent.scope, intent.subject_id, intent.attempts
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', id, 'scope', scope, 'subjectId', subject_id, 'attempts', attempts
  ) order by id), '[]'::jsonb) into v_claims from leased;
  return pg_catalog.jsonb_build_object('claims', v_claims);
end;
$flag$;

comment on function private.feature_flag_erasure_claim(integer) is
  'Service-role drain step 1: leases up to p_limit due erasure intents with exponential backoff and returns them. Takes no erasure lock.';

revoke all on function private.feature_flag_erasure_claim(integer)
  from public, anon, authenticated;
grant execute on function private.feature_flag_erasure_claim(integer) to service_role;

-- Erases one claimed subject and deletes its intent in one transaction. A lock
-- wait that exceeds the bound (55P03) rolls the erasure back, records the
-- failure on the intent and returns busy; the lease then spaces the retry.
create function private.feature_flag_erasure_complete(p_id bigint)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '2s'
as $flag$
declare
  v_intent private.feature_flag_erasure_intents%rowtype;
  v_result jsonb;
begin
  perform private.feature_flag_require_service_role();
  select * into v_intent from private.feature_flag_erasure_intents
  where id = p_id for update skip locked;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'gone');
  end if;
  begin
    v_result := private.feature_flag_erase_subject(v_intent.scope, v_intent.subject_id);
    delete from private.feature_flag_erasure_intents where id = v_intent.id;
  exception when lock_not_available then
    update private.feature_flag_erasure_intents
      set last_error = 'lock_not_available'
      where id = v_intent.id;
    return pg_catalog.jsonb_build_object('status', 'busy', 'attempts', v_intent.attempts);
  end;
  return pg_catalog.jsonb_build_object('status', 'erased') || (v_result - 'status');
end;
$flag$;

comment on function private.feature_flag_erasure_complete(bigint) is
  'Service-role drain step 2: erases the claimed subject and removes its intent atomically, or returns busy when the erasure lock stays contended.';

revoke all on function private.feature_flag_erasure_complete(bigint)
  from public, anon, authenticated;
grant execute on function private.feature_flag_erasure_complete(bigint) to service_role;

create function private.feature_flag_erasure_status()
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '2s'
as $flag$
begin
  perform private.feature_flag_require_service_role();
  return (
    select pg_catalog.jsonb_build_object(
      'pending', pg_catalog.count(*),
      'due', pg_catalog.count(*) filter (
        where next_attempt_at <= pg_catalog.clock_timestamp()),
      'maxAttempts', coalesce(pg_catalog.max(attempts), 0),
      'oldestCreatedAt', pg_catalog.min(created_at)
    ) from private.feature_flag_erasure_intents
  );
end;
$flag$;

comment on function private.feature_flag_erasure_status() is
  'Service-role view of the erasure queue: pending and due counts, the highest attempt count and the oldest intent.';

revoke all on function private.feature_flag_erasure_status()
  from public, anon, authenticated;
grant execute on function private.feature_flag_erasure_status() to service_role;
