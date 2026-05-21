create or replace function "private"."user_group_activity_actor_workspace_user_id"(
  p_before jsonb,
  p_after jsonb
)
returns uuid
language sql
immutable
as $function$
  select coalesce(
    public.try_parse_uuid(p_after->>'updated_by'),
    public.try_parse_uuid(p_before->>'updated_by'),
    public.try_parse_uuid(p_after->>'approved_by'),
    public.try_parse_uuid(p_before->>'approved_by'),
    public.try_parse_uuid(p_after->>'rejected_by'),
    public.try_parse_uuid(p_before->>'rejected_by'),
    public.try_parse_uuid(p_after->>'creator_id'),
    public.try_parse_uuid(p_before->>'creator_id'),
    public.try_parse_uuid(p_after->>'created_by'),
    public.try_parse_uuid(p_before->>'created_by')
  );
$function$;

create or replace function "private"."list_user_group_activity_logs"(
  p_ws_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_group_id uuid default null,
  p_resource_type text default 'all',
  p_action text default 'all',
  p_affected_user_query text default null,
  p_actor_query text default null,
  p_query text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  audit_record_id bigint,
  table_name text,
  action text,
  resource_type text,
  occurred_at timestamptz,
  group_id uuid,
  group_name text,
  resource_id uuid,
  resource_label text,
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
set search_path = public, audit, private
as $function$
  with enriched as (
    select
      feed.audit_record_id,
      feed.table_name,
      feed.action,
      feed.resource_type,
      feed.occurred_at,
      feed.group_id,
      feed.group_name,
      feed.resource_id,
      feed.resource_label,
      feed.affected_user_id,
      feed.affected_user_name,
      feed.affected_user_email,
      feed.actor_auth_uid,
      coalesce(feed.actor_workspace_user_id, fallback_actor."id") as actor_workspace_user_id,
      coalesce(feed.actor_id, fallback_actor."id") as actor_id,
      coalesce(
        feed.actor_name,
        fallback_actor."full_name",
        fallback_actor."display_name"
      ) as actor_name,
      coalesce(feed.actor_email, fallback_actor."email") as actor_email,
      feed.changed_fields,
      feed.before,
      feed.after
    from private.user_group_activity_feed(p_ws_id, p_start, p_end) feed
    left join "public"."workspace_users" fallback_actor
      on fallback_actor."id" = private.user_group_activity_actor_workspace_user_id(feed.before, feed.after)
     and fallback_actor."ws_id" = p_ws_id
  ),
  filtered as (
    select *
    from enriched feed
    where (p_group_id is null or feed.group_id = p_group_id)
      and (p_resource_type is null or p_resource_type = 'all' or feed.resource_type = p_resource_type)
      and (p_action is null or p_action = 'all' or feed.action = p_action)
      and (
        p_affected_user_query is null
        or btrim(p_affected_user_query) = ''
        or coalesce(feed.affected_user_name, '') ilike '%' || btrim(p_affected_user_query) || '%'
        or coalesce(feed.affected_user_email, '') ilike '%' || btrim(p_affected_user_query) || '%'
      )
      and (
        p_actor_query is null
        or btrim(p_actor_query) = ''
        or coalesce(feed.actor_name, '') ilike '%' || btrim(p_actor_query) || '%'
        or coalesce(feed.actor_email, '') ilike '%' || btrim(p_actor_query) || '%'
        or coalesce(feed.actor_auth_uid::text, '') ilike '%' || btrim(p_actor_query) || '%'
        or coalesce(feed.actor_workspace_user_id::text, '') ilike '%' || btrim(p_actor_query) || '%'
      )
      and (
        p_query is null
        or btrim(p_query) = ''
        or coalesce(feed.group_name, '') ilike '%' || btrim(p_query) || '%'
        or coalesce(feed.resource_label, '') ilike '%' || btrim(p_query) || '%'
        or coalesce(feed.affected_user_name, '') ilike '%' || btrim(p_query) || '%'
        or coalesce(feed.affected_user_email, '') ilike '%' || btrim(p_query) || '%'
        or coalesce(feed.actor_name, '') ilike '%' || btrim(p_query) || '%'
        or coalesce(feed.actor_email, '') ilike '%' || btrim(p_query) || '%'
      )
  )
  select
    filtered.audit_record_id,
    filtered.table_name,
    filtered.action,
    filtered.resource_type,
    filtered.occurred_at,
    filtered.group_id,
    filtered.group_name,
    filtered.resource_id,
    filtered.resource_label,
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

revoke all on function "private"."user_group_activity_actor_workspace_user_id"(jsonb, jsonb) from public, anon, authenticated;
revoke all on function "private"."list_user_group_activity_logs"(uuid, timestamptz, timestamptz, uuid, text, text, text, text, text, integer, integer) from public, anon, authenticated;

grant execute on function "private"."user_group_activity_actor_workspace_user_id"(jsonb, jsonb) to service_role;
grant execute on function "private"."list_user_group_activity_logs"(uuid, timestamptz, timestamptz, uuid, text, text, text, text, text, integer, integer) to service_role;
