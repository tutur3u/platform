create or replace function "public"."workspace_user_audit_event_kind"(
  p_op audit.operation,
  next_record jsonb,
  previous_record jsonb
)
returns text
language sql
immutable
as $function$
  select case
    when p_op = 'INSERT' then 'created'
    when p_op = 'DELETE' then 'deleted'
    when p_op <> 'UPDATE' then null
    when coalesce((next_record->>'archived')::boolean, false)
         is distinct from coalesce((previous_record->>'archived')::boolean, false)
      then case
        when coalesce((next_record->>'archived')::boolean, false)
          then 'archived'
        else 'reactivated'
      end
    when nullif(next_record->>'archived_until', '')::timestamptz
         is distinct from nullif(previous_record->>'archived_until', '')::timestamptz
      then 'archive_until_changed'
    else 'updated'
  end;
$function$;

create or replace function "public"."workspace_user_audit_changed_fields"(
  next_record jsonb,
  previous_record jsonb
)
returns text[]
language sql
immutable
as $function$
  select coalesce(
    array_agg(changed.key order by changed.key),
    array[]::text[]
  )
  from (
    select merged.key
    from jsonb_object_keys(
      coalesce(next_record, '{}'::jsonb) || coalesce(previous_record, '{}'::jsonb)
    ) as merged(key)
    where (coalesce(previous_record, '{}'::jsonb)->merged.key)
          is distinct from (coalesce(next_record, '{}'::jsonb)->merged.key)
  ) changed;
$function$;

create or replace function "public"."workspace_user_audit_changed_snapshot"(
  next_record jsonb,
  previous_record jsonb,
  p_use_next boolean
)
returns jsonb
language sql
immutable
as $function$
  select coalesce(
    jsonb_object_agg(
      changed.key,
      case
        when p_use_next
          then coalesce(coalesce(next_record, '{}'::jsonb)->changed.key, 'null'::jsonb)
        else coalesce(coalesce(previous_record, '{}'::jsonb)->changed.key, 'null'::jsonb)
      end
      order by changed.key
    ),
    '{}'::jsonb
  )
  from (
    select merged.key
    from jsonb_object_keys(
      coalesce(next_record, '{}'::jsonb) || coalesce(previous_record, '{}'::jsonb)
    ) as merged(key)
    where (coalesce(previous_record, '{}'::jsonb)->merged.key)
          is distinct from (coalesce(next_record, '{}'::jsonb)->merged.key)
  ) changed;
$function$;

create or replace function "public"."workspace_user_audit_feed"(
  p_ws_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  audit_record_id bigint,
  event_kind text,
  occurred_at timestamptz,
  source text,
  affected_user_id uuid,
  affected_user_name text,
  affected_user_email text,
  actor_auth_uid uuid,
  actor_workspace_user_id uuid,
  actor_id uuid,
  actor_name text,
  actor_email text,
  changed_fields text[],
  before jsonb,
  after jsonb
)
language sql
security definer
set search_path = public, audit
as $function$
  with live_events as (
    select
      audit_log.id as audit_record_id,
      public.workspace_user_audit_event_kind(
        audit_log.op,
        audit_log.record,
        audit_log.old_record
      ) as event_kind,
      audit_log.ts as occurred_at,
      coalesce(status_change.source, 'live') as source,
      public.workspace_user_audit_user_id(
        audit_log.record,
        audit_log.old_record
      ) as affected_user_id,
      coalesce(
        affected_user.full_name,
        affected_user.display_name,
        nullif(audit_log.record->>'full_name', ''),
        nullif(audit_log.record->>'display_name', ''),
        nullif(audit_log.old_record->>'full_name', ''),
        nullif(audit_log.old_record->>'display_name', '')
      ) as affected_user_name,
      coalesce(
        affected_user.email,
        nullif(audit_log.record->>'email', ''),
        nullif(audit_log.old_record->>'email', '')
      ) as affected_user_email,
      audit_log.auth_uid as actor_auth_uid,
      linked_user.virtual_user_id as actor_workspace_user_id,
      coalesce(audit_log.auth_uid, linked_user.virtual_user_id) as actor_id,
      coalesce(
        actor_workspace_user.full_name,
        actor_workspace_user.display_name,
        actor_private_details.full_name,
        actor_user.display_name
      ) as actor_name,
      coalesce(
        actor_workspace_user.email,
        actor_private_details.email
      ) as actor_email,
      public.workspace_user_audit_changed_fields(
        audit_log.record,
        audit_log.old_record
      ) as changed_fields,
      public.workspace_user_audit_changed_snapshot(
        audit_log.record,
        audit_log.old_record,
        false
      ) as before,
      public.workspace_user_audit_changed_snapshot(
        audit_log.record,
        audit_log.old_record,
        true
      ) as after
    from audit.record_version audit_log
    left join public.workspace_user_status_changes status_change
      on status_change.audit_record_version_id = audit_log.id
     and status_change.ws_id = p_ws_id
    left join public.workspace_users affected_user
      on affected_user.id = public.workspace_user_audit_user_id(
        audit_log.record,
        audit_log.old_record
      )
     and affected_user.ws_id = p_ws_id
    left join public.workspace_user_linked_users linked_user
      on linked_user.platform_user_id = audit_log.auth_uid
     and linked_user.ws_id = p_ws_id
    left join public.workspace_users actor_workspace_user
      on actor_workspace_user.id = linked_user.virtual_user_id
     and actor_workspace_user.ws_id = p_ws_id
    left join public.users actor_user
      on actor_user.id = audit_log.auth_uid
    left join public.user_private_details actor_private_details
      on actor_private_details.user_id = actor_user.id
    where audit_log.table_schema = 'public'
      and audit_log.table_name = 'workspace_users'
      and audit_log.ts >= p_start
      and audit_log.ts < p_end
      and public.workspace_user_audit_ws_id(audit_log.record, audit_log.old_record) = p_ws_id
  ),
  legacy_ranked as (
    select
      coalesce(
        status_change.audit_record_version_id,
        -row_number() over (
          order by status_change.created_at desc, status_change.user_id desc
        )::bigint
      ) as audit_record_id,
      status_change.audit_record_version_id,
      status_change.user_id as affected_user_id,
      status_change.created_at as occurred_at,
      status_change.source,
      status_change.archived,
      status_change.archived_until,
      lag(status_change.archived) over (
        partition by status_change.user_id
        order by status_change.created_at asc, status_change.audit_record_version_id asc nulls last
      ) as previous_archived,
      lag(status_change.archived_until) over (
        partition by status_change.user_id
        order by status_change.created_at asc, status_change.audit_record_version_id asc nulls last
      ) as previous_archived_until,
      affected_user.full_name as affected_user_full_name,
      affected_user.display_name as affected_user_display_name,
      affected_user.email as affected_user_email,
      status_change.actor_auth_uid,
      status_change.creator_id as actor_workspace_user_id,
      coalesce(status_change.actor_auth_uid, status_change.creator_id) as actor_id,
      coalesce(
        actor_workspace_user.full_name,
        actor_workspace_user.display_name,
        actor_private_details.full_name,
        actor_user.display_name
      ) as actor_name,
      coalesce(
        actor_workspace_user.email,
        actor_private_details.email
      ) as actor_email
    from public.workspace_user_status_changes status_change
    left join live_events live_event
      on live_event.audit_record_id = status_change.audit_record_version_id
    left join public.workspace_users affected_user
      on affected_user.id = status_change.user_id
     and affected_user.ws_id = p_ws_id
    left join public.workspace_users actor_workspace_user
      on actor_workspace_user.id = status_change.creator_id
     and actor_workspace_user.ws_id = p_ws_id
    left join public.users actor_user
      on actor_user.id = status_change.actor_auth_uid
    left join public.user_private_details actor_private_details
      on actor_private_details.user_id = actor_user.id
    where status_change.ws_id = p_ws_id
      and status_change.created_at >= p_start
      and status_change.created_at < p_end
      and live_event.audit_record_id is null
  ),
  legacy_events as (
    select
      legacy_ranked.audit_record_id,
      case
        when not legacy_ranked.archived then 'reactivated'
        when legacy_ranked.previous_archived = true
             and legacy_ranked.previous_archived_until is distinct from legacy_ranked.archived_until
          then 'archive_until_changed'
        else 'archived'
      end as event_kind,
      legacy_ranked.occurred_at,
      legacy_ranked.source,
      legacy_ranked.affected_user_id,
      coalesce(
        legacy_ranked.affected_user_full_name,
        legacy_ranked.affected_user_display_name
      ) as affected_user_name,
      legacy_ranked.affected_user_email,
      legacy_ranked.actor_auth_uid,
      legacy_ranked.actor_workspace_user_id,
      legacy_ranked.actor_id,
      legacy_ranked.actor_name,
      legacy_ranked.actor_email,
      case
        when legacy_ranked.archived
             and legacy_ranked.previous_archived = true
             and legacy_ranked.previous_archived_until is distinct from legacy_ranked.archived_until
          then array['archived_until']::text[]
        when legacy_ranked.archived_until is distinct from legacy_ranked.previous_archived_until
             and legacy_ranked.archived_until is not null
          then array['archived', 'archived_until']::text[]
        else array['archived']::text[]
      end as changed_fields,
      case
        when legacy_ranked.archived
             and legacy_ranked.previous_archived = true
             and legacy_ranked.previous_archived_until is distinct from legacy_ranked.archived_until
          then jsonb_build_object(
            'archived_until',
            to_jsonb(legacy_ranked.previous_archived_until)
          )
        when legacy_ranked.archived_until is distinct from legacy_ranked.previous_archived_until
             and legacy_ranked.archived_until is not null
          then jsonb_build_object(
            'archived',
            to_jsonb(coalesce(legacy_ranked.previous_archived, not legacy_ranked.archived)),
            'archived_until',
            to_jsonb(legacy_ranked.previous_archived_until)
          )
        else jsonb_build_object(
          'archived',
          to_jsonb(coalesce(legacy_ranked.previous_archived, not legacy_ranked.archived))
        )
      end as before,
      case
        when legacy_ranked.archived
             and legacy_ranked.previous_archived = true
             and legacy_ranked.previous_archived_until is distinct from legacy_ranked.archived_until
          then jsonb_build_object(
            'archived_until',
            to_jsonb(legacy_ranked.archived_until)
          )
        when legacy_ranked.archived_until is distinct from legacy_ranked.previous_archived_until
             and legacy_ranked.archived_until is not null
          then jsonb_build_object(
            'archived',
            to_jsonb(legacy_ranked.archived),
            'archived_until',
            to_jsonb(legacy_ranked.archived_until)
          )
        else jsonb_build_object(
          'archived',
          to_jsonb(legacy_ranked.archived)
        )
      end as after
    from legacy_ranked
  )
  select
    feed.audit_record_id,
    feed.event_kind,
    feed.occurred_at,
    feed.source,
    feed.affected_user_id,
    feed.affected_user_name,
    feed.affected_user_email,
    feed.actor_auth_uid,
    feed.actor_workspace_user_id,
    feed.actor_id,
    feed.actor_name,
    feed.actor_email,
    feed.changed_fields,
    feed.before,
    feed.after
  from (
    select * from live_events where event_kind is not null
    union all
    select * from legacy_events
  ) feed;
$function$;

create or replace function "public"."list_workspace_user_audit_feed"(
  p_ws_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_event_kind text default 'all',
  p_source text default 'all',
  p_affected_user_query text default null,
  p_actor_query text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  audit_record_id bigint,
  event_kind text,
  occurred_at timestamptz,
  source text,
  affected_user_id uuid,
  affected_user_name text,
  affected_user_email text,
  actor_auth_uid uuid,
  actor_workspace_user_id uuid,
  actor_id uuid,
  actor_name text,
  actor_email text,
  changed_fields text[],
  before jsonb,
  after jsonb,
  total_count bigint
)
language sql
security definer
set search_path = public, audit
as $function$
  with filtered as (
    select *
    from public.workspace_user_audit_feed(p_ws_id, p_start, p_end)
    where (p_event_kind is null or p_event_kind = 'all' or event_kind = p_event_kind)
      and (p_source is null or p_source = 'all' or source = p_source)
      and (
        p_affected_user_query is null
        or btrim(p_affected_user_query) = ''
        or coalesce(affected_user_name, '') ilike '%' || btrim(p_affected_user_query) || '%'
        or coalesce(affected_user_email, '') ilike '%' || btrim(p_affected_user_query) || '%'
      )
      and (
        p_actor_query is null
        or btrim(p_actor_query) = ''
        or coalesce(actor_name, '') ilike '%' || btrim(p_actor_query) || '%'
        or coalesce(actor_email, '') ilike '%' || btrim(p_actor_query) || '%'
        or coalesce(actor_auth_uid::text, '') ilike '%' || btrim(p_actor_query) || '%'
      )
  )
  select
    filtered.audit_record_id,
    filtered.event_kind,
    filtered.occurred_at,
    filtered.source,
    filtered.affected_user_id,
    filtered.affected_user_name,
    filtered.affected_user_email,
    filtered.actor_auth_uid,
    filtered.actor_workspace_user_id,
    filtered.actor_id,
    filtered.actor_name,
    filtered.actor_email,
    filtered.changed_fields,
    filtered.before,
    filtered.after,
    count(*) over () as total_count
  from filtered
  order by filtered.occurred_at desc, filtered.audit_record_id desc
  limit greatest(coalesce(p_limit, 100), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

create or replace function "public"."summarize_workspace_user_audit_feed"(
  p_ws_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_event_kind text default 'all',
  p_source text default 'all',
  p_affected_user_query text default null,
  p_actor_query text default null
)
returns table (
  total_events bigint,
  archived_events bigint,
  reactivated_events bigint,
  archive_timing_events bigint,
  archive_related_events bigint,
  profile_updates bigint,
  affected_users_count bigint,
  top_actor_name text,
  top_actor_count bigint
)
language sql
security definer
set search_path = public, audit
as $function$
  with filtered as (
    select *
    from public.workspace_user_audit_feed(p_ws_id, p_start, p_end)
    where (p_event_kind is null or p_event_kind = 'all' or event_kind = p_event_kind)
      and (p_source is null or p_source = 'all' or source = p_source)
      and (
        p_affected_user_query is null
        or btrim(p_affected_user_query) = ''
        or coalesce(affected_user_name, '') ilike '%' || btrim(p_affected_user_query) || '%'
        or coalesce(affected_user_email, '') ilike '%' || btrim(p_affected_user_query) || '%'
      )
      and (
        p_actor_query is null
        or btrim(p_actor_query) = ''
        or coalesce(actor_name, '') ilike '%' || btrim(p_actor_query) || '%'
        or coalesce(actor_email, '') ilike '%' || btrim(p_actor_query) || '%'
        or coalesce(actor_auth_uid::text, '') ilike '%' || btrim(p_actor_query) || '%'
      )
  ),
  actor_counts as (
    select
      coalesce(actor_name, actor_email, actor_auth_uid::text, 'Unknown') as actor_label,
      count(*) as actor_count
    from filtered
    group by 1
    order by actor_count desc, actor_label asc
    limit 1
  )
  select
    count(*) as total_events,
    count(*) filter (where event_kind = 'archived') as archived_events,
    count(*) filter (where event_kind = 'reactivated') as reactivated_events,
    count(*) filter (where event_kind = 'archive_until_changed') as archive_timing_events,
    count(*) filter (
      where event_kind in ('archived', 'reactivated', 'archive_until_changed')
    ) as archive_related_events,
    count(*) filter (where event_kind = 'updated') as profile_updates,
    count(distinct affected_user_id) as affected_users_count,
    (select actor_label from actor_counts) as top_actor_name,
    coalesce((select actor_count from actor_counts), 0) as top_actor_count
  from filtered;
$function$;

create or replace function "public"."list_workspace_user_audit_bucket_counts"(
  p_ws_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_period text,
  p_event_kind text default 'all',
  p_source text default 'all',
  p_affected_user_query text default null,
  p_actor_query text default null
)
returns table (
  bucket_key text,
  total_count bigint,
  archived_count bigint,
  reactivated_count bigint,
  archive_timing_count bigint,
  profile_update_count bigint
)
language sql
security definer
set search_path = public, audit
as $function$
  with filtered as (
    select *
    from public.workspace_user_audit_feed(p_ws_id, p_start, p_end)
    where (p_event_kind is null or p_event_kind = 'all' or event_kind = p_event_kind)
      and (p_source is null or p_source = 'all' or source = p_source)
      and (
        p_affected_user_query is null
        or btrim(p_affected_user_query) = ''
        or coalesce(affected_user_name, '') ilike '%' || btrim(p_affected_user_query) || '%'
        or coalesce(affected_user_email, '') ilike '%' || btrim(p_affected_user_query) || '%'
      )
      and (
        p_actor_query is null
        or btrim(p_actor_query) = ''
        or coalesce(actor_name, '') ilike '%' || btrim(p_actor_query) || '%'
        or coalesce(actor_email, '') ilike '%' || btrim(p_actor_query) || '%'
        or coalesce(actor_auth_uid::text, '') ilike '%' || btrim(p_actor_query) || '%'
      )
  )
  select
    case
      when p_period = 'yearly' then to_char(filtered.occurred_at at time zone 'UTC', 'YYYY-MM')
      else to_char(filtered.occurred_at at time zone 'UTC', 'YYYY-MM-DD')
    end as bucket_key,
    count(*) as total_count,
    count(*) filter (where filtered.event_kind = 'archived') as archived_count,
    count(*) filter (where filtered.event_kind = 'reactivated') as reactivated_count,
    count(*) filter (where filtered.event_kind = 'archive_until_changed') as archive_timing_count,
    count(*) filter (where filtered.event_kind = 'updated') as profile_update_count
  from filtered
  group by 1
  order by 1 asc;
$function$;
