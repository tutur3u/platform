create or replace function "public"."backfill_workspace_user_status_changes"(
  p_ws_id uuid,
  p_dry_run boolean default true,
  p_limit integer default 500
)
returns table (
  audit_record_version_id bigint,
  user_id uuid,
  ws_id uuid,
  archived boolean,
  archived_until timestamptz,
  actor_auth_uid uuid,
  creator_id uuid,
  source text,
  created_at timestamptz,
  event_kind text
)
language plpgsql
security definer
set search_path = public, audit
as $function$
#variable_conflict use_column
begin
  if p_limit is null or p_limit < 1 then
    raise exception 'p_limit must be at least 1';
  end if;

  if p_dry_run then
    return query
    with audit_candidates as (
      select
        audit_log.id as audit_record_version_id,
        public.workspace_user_audit_user_id(audit_log.record, audit_log.old_record) as user_id,
        public.workspace_user_audit_ws_id(audit_log.record, audit_log.old_record) as ws_id,
        coalesce((audit_log.record->>'archived')::boolean, false) as archived,
        nullif(audit_log.record->>'archived_until', '')::timestamptz as archived_until,
        audit_log.auth_uid as actor_auth_uid,
        linked_user.virtual_user_id as creator_id,
        'backfilled'::text as source,
        audit_log.ts as created_at,
        case
          when coalesce((audit_log.old_record->>'archived')::boolean, false)
               is distinct from coalesce((audit_log.record->>'archived')::boolean, false)
            then case
              when coalesce((audit_log.record->>'archived')::boolean, false)
                then 'archived'
              else 'reactivated'
            end
          when nullif(audit_log.old_record->>'archived_until', '')::timestamptz
               is distinct from nullif(audit_log.record->>'archived_until', '')::timestamptz
            then 'archive_until_changed'
          else null
        end as event_kind
      from audit.record_version audit_log
      left join public.workspace_user_linked_users linked_user
        on linked_user.platform_user_id = audit_log.auth_uid
       and linked_user.ws_id = public.workspace_user_audit_ws_id(audit_log.record, audit_log.old_record)
      where audit_log.table_schema = 'public'
        and audit_log.table_name = 'workspace_users'
        and audit_log.op = 'UPDATE'
        and public.workspace_user_audit_ws_id(audit_log.record, audit_log.old_record) = p_ws_id
    ),
    filtered_candidates as (
      select *
      from audit_candidates
      where audit_candidates.user_id is not null
        and audit_candidates.event_kind is not null
        and not exists (
          select 1
          from public.workspace_user_status_changes existing_log
          where existing_log.audit_record_version_id = audit_candidates.audit_record_version_id
        )
      order by audit_candidates.created_at asc, audit_candidates.audit_record_version_id asc
      limit p_limit
    )
    select
      filtered_candidates.audit_record_version_id,
      filtered_candidates.user_id,
      filtered_candidates.ws_id,
      filtered_candidates.archived,
      filtered_candidates.archived_until,
      filtered_candidates.actor_auth_uid,
      filtered_candidates.creator_id,
      filtered_candidates.source,
      filtered_candidates.created_at,
      filtered_candidates.event_kind
    from filtered_candidates;

    return;
  end if;

  return query
  with audit_candidates as (
    select
      audit_log.id as audit_record_version_id,
      public.workspace_user_audit_user_id(audit_log.record, audit_log.old_record) as user_id,
      public.workspace_user_audit_ws_id(audit_log.record, audit_log.old_record) as ws_id,
      coalesce((audit_log.record->>'archived')::boolean, false) as archived,
      nullif(audit_log.record->>'archived_until', '')::timestamptz as archived_until,
      audit_log.auth_uid as actor_auth_uid,
      linked_user.virtual_user_id as creator_id,
      'backfilled'::text as source,
      audit_log.ts as created_at,
      case
        when coalesce((audit_log.old_record->>'archived')::boolean, false)
             is distinct from coalesce((audit_log.record->>'archived')::boolean, false)
          then case
            when coalesce((audit_log.record->>'archived')::boolean, false)
              then 'archived'
            else 'reactivated'
          end
        when nullif(audit_log.old_record->>'archived_until', '')::timestamptz
             is distinct from nullif(audit_log.record->>'archived_until', '')::timestamptz
          then 'archive_until_changed'
        else null
      end as event_kind
    from audit.record_version audit_log
    left join public.workspace_user_linked_users linked_user
      on linked_user.platform_user_id = audit_log.auth_uid
     and linked_user.ws_id = public.workspace_user_audit_ws_id(audit_log.record, audit_log.old_record)
    where audit_log.table_schema = 'public'
      and audit_log.table_name = 'workspace_users'
      and audit_log.op = 'UPDATE'
      and public.workspace_user_audit_ws_id(audit_log.record, audit_log.old_record) = p_ws_id
  ),
  filtered_candidates as (
    select *
    from audit_candidates
    where audit_candidates.user_id is not null
      and audit_candidates.event_kind is not null
      and not exists (
        select 1
        from public.workspace_user_status_changes existing_log
        where existing_log.audit_record_version_id = audit_candidates.audit_record_version_id
      )
    order by audit_candidates.created_at asc, audit_candidates.audit_record_version_id asc
    limit p_limit
  ),
  inserted as (
    insert into public.workspace_user_status_changes (
      user_id,
      ws_id,
      archived,
      archived_until,
      creator_id,
      created_at,
      actor_auth_uid,
      source,
      audit_record_version_id
    )
    select
      filtered_candidates.user_id,
      filtered_candidates.ws_id,
      filtered_candidates.archived,
      filtered_candidates.archived_until,
      filtered_candidates.creator_id,
      filtered_candidates.created_at,
      filtered_candidates.actor_auth_uid,
      filtered_candidates.source,
      filtered_candidates.audit_record_version_id
    from filtered_candidates
    on conflict (audit_record_version_id) do nothing
    returning
      workspace_user_status_changes.audit_record_version_id,
      workspace_user_status_changes.user_id,
      workspace_user_status_changes.ws_id,
      workspace_user_status_changes.archived,
      workspace_user_status_changes.archived_until,
      workspace_user_status_changes.actor_auth_uid,
      workspace_user_status_changes.creator_id,
      workspace_user_status_changes.source,
      workspace_user_status_changes.created_at
  )
  select
    inserted.audit_record_version_id,
    inserted.user_id,
    inserted.ws_id,
    inserted.archived,
    inserted.archived_until,
    inserted.actor_auth_uid,
    inserted.creator_id,
    inserted.source,
    inserted.created_at,
    filtered_candidates.event_kind
  from inserted
  join filtered_candidates
    on filtered_candidates.audit_record_version_id = inserted.audit_record_version_id
  order by inserted.created_at asc, inserted.audit_record_version_id asc;
end;
$function$;
