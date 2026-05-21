set check_function_bodies = off;

create schema if not exists "private";

do $$
declare
  tracked_table text;
  tracked_table_regclass regclass;
begin
  foreach tracked_table in array array[
    'workspace_user_groups',
    'workspace_user_groups_users',
    'workspace_user_group_tag_groups',
    'workspace_default_included_user_groups',
    'user_group_posts',
    'user_group_post_logs',
    'user_group_post_checks',
    'user_group_attendance',
    'user_group_linked_products',
    'user_group_metrics',
    'user_group_metric_categories',
    'user_group_metric_category_links',
    'user_indicators',
    'external_user_monthly_reports',
    'external_user_monthly_report_logs',
    'user_feedbacks',
    'workspace_course_modules',
    'workspace_course_module_groups'
  ] loop
    tracked_table_regclass := to_regclass(format('public.%I', tracked_table));

    if tracked_table_regclass is not null
      and audit.primary_key_columns(tracked_table_regclass) <> array[]::text[] then
      perform audit.enable_tracking(tracked_table_regclass);
    end if;
  end loop;
end $$;

create index if not exists "record_version_user_group_activity_ts_idx"
  on "audit"."record_version" ("ts" desc, "id" desc)
  where "table_schema" = 'public'
    and "table_name" in (
      'workspace_user_groups',
      'workspace_user_groups_users',
      'workspace_user_group_tag_groups',
      'workspace_default_included_user_groups',
      'user_group_posts',
      'user_group_post_logs',
      'user_group_post_checks',
      'user_group_attendance',
      'user_group_linked_products',
      'user_group_metrics',
      'user_group_metric_categories',
      'user_group_metric_category_links',
      'user_indicators',
      'external_user_monthly_reports',
      'external_user_monthly_report_logs',
      'user_feedbacks',
      'workspace_course_modules',
      'workspace_course_module_groups'
    );

create or replace function "private"."user_group_activity_resource_type"(
  p_table_name text
)
returns text
language sql
immutable
as $function$
  select case p_table_name
    when 'workspace_user_groups' then 'group'
    when 'workspace_user_groups_users' then 'membership'
    when 'workspace_user_group_tag_groups' then 'tag'
    when 'workspace_default_included_user_groups' then 'default_included_group'
    when 'user_group_posts' then 'post'
    when 'user_group_post_logs' then 'post_log'
    when 'user_group_post_checks' then 'post_check'
    when 'user_group_attendance' then 'attendance'
    when 'user_group_linked_products' then 'linked_product'
    when 'user_group_metrics' then 'metric'
    when 'user_group_metric_categories' then 'metric_category'
    when 'user_group_metric_category_links' then 'metric_category_link'
    when 'user_indicators' then 'student_metric_value'
    when 'external_user_monthly_reports' then 'monthly_report'
    when 'external_user_monthly_report_logs' then 'monthly_report_log'
    when 'user_feedbacks' then 'feedback'
    when 'workspace_course_modules' then 'course_module'
    when 'workspace_course_module_groups' then 'course_module_group'
    else 'resource'
  end;
$function$;

create or replace function "private"."user_group_activity_action"(
  p_op audit.operation,
  p_table_name text,
  next_record jsonb,
  previous_record jsonb
)
returns text
language sql
immutable
as $function$
  with changed as (
    select public.workspace_user_audit_changed_fields(
      coalesce(next_record, '{}'::jsonb),
      coalesce(previous_record, '{}'::jsonb)
    ) as fields
  )
  select case
    when p_op = 'INSERT' then 'created'
    when p_op = 'DELETE' then 'deleted'
    when p_op <> 'UPDATE' then null
    when p_table_name = 'workspace_user_groups'
      and coalesce(nullif(next_record->>'archived', '')::boolean, false)
        is distinct from coalesce(nullif(previous_record->>'archived', '')::boolean, false)
      then case
        when coalesce(nullif(next_record->>'archived', '')::boolean, false)
          then 'archived'
        else 'reactivated'
      end
    when p_table_name = 'workspace_user_groups_users'
      and coalesce(next_record->>'role', '') is distinct from coalesce(previous_record->>'role', '')
      then 'role_updated'
    when p_table_name in ('workspace_course_modules', 'workspace_course_module_groups')
      and 'sort_key' = any(changed.fields)
      then 'reordered'
    else 'updated'
  end
  from changed;
$function$;

create or replace function "private"."user_group_activity_feed"(
  p_ws_id uuid,
  p_start timestamptz,
  p_end timestamptz
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
  after jsonb
)
language sql
security definer
set search_path = public, audit, private
as $function$
  with audit_rows as (
    select
      audit_log."id" as audit_record_id,
      audit_log."table_name",
      audit_log."op",
      audit_log."ts" as occurred_at,
      coalesce(audit_log."record", '{}'::jsonb) as next_record,
      coalesce(audit_log."old_record", '{}'::jsonb) as previous_record,
      audit_log."auth_uid" as actor_auth_uid
    from "audit"."record_version" audit_log
    where audit_log."table_schema" = 'public'
      and audit_log."table_name" in (
        'workspace_user_groups',
        'workspace_user_groups_users',
        'workspace_user_group_tag_groups',
        'workspace_default_included_user_groups',
        'user_group_posts',
        'user_group_post_logs',
        'user_group_post_checks',
        'user_group_attendance',
        'user_group_linked_products',
        'user_group_metrics',
        'user_group_metric_categories',
        'user_group_metric_category_links',
        'user_indicators',
        'external_user_monthly_reports',
        'external_user_monthly_report_logs',
        'user_feedbacks',
        'workspace_course_modules',
        'workspace_course_module_groups'
      )
      and audit_log."ts" >= p_start
      and audit_log."ts" < p_end
  ),
  normalized as (
    select
      audit_rows.*,
      private.user_group_activity_action(
        audit_rows."op",
        audit_rows."table_name",
        audit_rows.next_record,
        audit_rows.previous_record
      ) as action,
      private.user_group_activity_resource_type(audit_rows."table_name") as resource_type,
      public.workspace_user_audit_changed_fields(
        audit_rows.next_record,
        audit_rows.previous_record
      ) as changed_fields,
      public.workspace_user_audit_changed_snapshot(
        audit_rows.next_record,
        audit_rows.previous_record,
        false
      ) as before,
      public.workspace_user_audit_changed_snapshot(
        audit_rows.next_record,
        audit_rows.previous_record,
        true
      ) as after
    from audit_rows
  ),
  ids as (
    select
      normalized.*,
      coalesce(
        public.try_parse_uuid(normalized.next_record->>'group_id'),
        public.try_parse_uuid(normalized.previous_record->>'group_id'),
        case
          when normalized."table_name" = 'workspace_user_groups'
            then coalesce(
              public.try_parse_uuid(normalized.next_record->>'id'),
              public.try_parse_uuid(normalized.previous_record->>'id')
            )
        end
      ) as direct_group_id,
      coalesce(
        public.try_parse_uuid(normalized.next_record->>'user_id'),
        public.try_parse_uuid(normalized.previous_record->>'user_id')
      ) as affected_user_id,
      coalesce(
        public.try_parse_uuid(normalized.next_record->>'post_id'),
        public.try_parse_uuid(normalized.previous_record->>'post_id'),
        case
          when normalized."table_name" = 'user_group_posts'
            then coalesce(
              public.try_parse_uuid(normalized.next_record->>'id'),
              public.try_parse_uuid(normalized.previous_record->>'id')
            )
        end
      ) as post_id,
      coalesce(
        public.try_parse_uuid(normalized.next_record->>'metric_id'),
        public.try_parse_uuid(normalized.previous_record->>'metric_id'),
        public.try_parse_uuid(normalized.next_record->>'indicator_id'),
        public.try_parse_uuid(normalized.previous_record->>'indicator_id'),
        case
          when normalized."table_name" = 'user_group_metrics'
            then coalesce(
              public.try_parse_uuid(normalized.next_record->>'id'),
              public.try_parse_uuid(normalized.previous_record->>'id')
            )
        end
      ) as metric_id,
      coalesce(
        public.try_parse_uuid(normalized.next_record->>'category_id'),
        public.try_parse_uuid(normalized.previous_record->>'category_id'),
        case
          when normalized."table_name" = 'user_group_metric_categories'
            then coalesce(
              public.try_parse_uuid(normalized.next_record->>'id'),
              public.try_parse_uuid(normalized.previous_record->>'id')
            )
        end
      ) as category_id,
      coalesce(
        public.try_parse_uuid(normalized.next_record->>'module_id'),
        public.try_parse_uuid(normalized.previous_record->>'module_id'),
        case
          when normalized."table_name" = 'workspace_course_modules'
            then coalesce(
              public.try_parse_uuid(normalized.next_record->>'id'),
              public.try_parse_uuid(normalized.previous_record->>'id')
            )
        end
      ) as module_id,
      coalesce(
        public.try_parse_uuid(normalized.next_record->>'module_group_id'),
        public.try_parse_uuid(normalized.previous_record->>'module_group_id'),
        case
          when normalized."table_name" = 'workspace_course_module_groups'
            then coalesce(
              public.try_parse_uuid(normalized.next_record->>'id'),
              public.try_parse_uuid(normalized.previous_record->>'id')
            )
        end
      ) as module_group_id,
      coalesce(
        public.try_parse_uuid(normalized.next_record->>'report_id'),
        public.try_parse_uuid(normalized.previous_record->>'report_id'),
        case
          when normalized."table_name" = 'external_user_monthly_reports'
            then coalesce(
              public.try_parse_uuid(normalized.next_record->>'id'),
              public.try_parse_uuid(normalized.previous_record->>'id')
            )
        end
      ) as report_id,
      coalesce(
        public.try_parse_uuid(normalized.next_record->>'product_id'),
        public.try_parse_uuid(normalized.previous_record->>'product_id')
      ) as product_id,
      coalesce(
        public.try_parse_uuid(normalized.next_record->>'tag_id'),
        public.try_parse_uuid(normalized.previous_record->>'tag_id')
      ) as tag_id
    from normalized
    where normalized.action is not null
  ),
  resolved as (
    select
      ids.*,
      coalesce(
        ids.direct_group_id,
        post_record."group_id",
        metric_record."group_id",
        module_record."group_id",
        module_group_record."group_id",
        report_record."group_id"
      ) as resolved_group_id,
      coalesce(
        public.try_parse_uuid(ids.next_record->>'ws_id'),
        public.try_parse_uuid(ids.previous_record->>'ws_id'),
        direct_group."ws_id",
        post_group."ws_id",
        metric_record."ws_id",
        category_record."ws_id",
        module_group_parent."ws_id",
        report_group."ws_id",
        affected_user_record."ws_id"
      ) as resolved_ws_id,
      coalesce(
        nullif(ids.next_record->>'name', ''),
        nullif(ids.previous_record->>'name', ''),
        nullif(ids.next_record->>'title', ''),
        nullif(ids.previous_record->>'title', ''),
        post_record."title",
        metric_record."name",
        category_record."name",
        module_record."name",
        module_group_record."title",
        report_record."title",
        product_record."name",
        tag_record."name",
        coalesce(affected_user_record."full_name", affected_user_record."display_name", affected_user_record."email"),
        nullif(left(coalesce(ids.next_record->>'content', ids.previous_record->>'content', ''), 80), '')
      ) as resolved_resource_label
    from ids
    left join "public"."workspace_user_groups" direct_group
      on direct_group."id" = ids.direct_group_id
    left join "public"."user_group_posts" post_record
      on post_record."id" = ids.post_id
    left join "public"."workspace_user_groups" post_group
      on post_group."id" = post_record."group_id"
    left join "public"."user_group_metrics" metric_record
      on metric_record."id" = ids.metric_id
    left join "public"."user_group_metric_categories" category_record
      on category_record."id" = ids.category_id
    left join "public"."workspace_course_modules" module_record
      on module_record."id" = ids.module_id
    left join "public"."workspace_course_module_groups" module_group_record
      on module_group_record."id" = ids.module_group_id
    left join "public"."workspace_user_groups" module_group_parent
      on module_group_parent."id" = coalesce(module_record."group_id", module_group_record."group_id")
    left join "public"."external_user_monthly_reports" report_record
      on report_record."id" = ids.report_id
    left join "public"."workspace_user_groups" report_group
      on report_group."id" = report_record."group_id"
    left join "public"."workspace_products" product_record
      on product_record."id" = ids.product_id
    left join "public"."workspace_user_group_tags" tag_record
      on tag_record."id" = ids.tag_id
    left join "public"."workspace_users" affected_user_record
      on affected_user_record."id" = ids.affected_user_id
  )
  select
    resolved.audit_record_id,
    resolved."table_name",
    resolved.action,
    resolved.resource_type,
    resolved.occurred_at,
    resolved_group."id" as group_id,
    resolved_group."name" as group_name,
    coalesce(
      case
        when resolved.resource_type in ('membership', 'attendance', 'student_metric_value')
          then resolved.affected_user_id
      end,
      resolved.post_id,
      resolved.metric_id,
      resolved.category_id,
      resolved.module_id,
      resolved.module_group_id,
      resolved.report_id,
      resolved.product_id,
      resolved.tag_id,
      public.try_parse_uuid(resolved.next_record->>'id'),
      public.try_parse_uuid(resolved.previous_record->>'id'),
      resolved.resolved_group_id
    ) as resource_id,
    resolved.resolved_resource_label as resource_label,
    resolved.affected_user_id,
    coalesce(
      affected_user."full_name",
      affected_user."display_name",
      nullif(resolved.next_record->>'full_name', ''),
      nullif(resolved.previous_record->>'full_name', '')
    ) as affected_user_name,
    coalesce(
      affected_user."email",
      nullif(resolved.next_record->>'email', ''),
      nullif(resolved.previous_record->>'email', '')
    ) as affected_user_email,
    resolved.actor_auth_uid,
    linked_user."virtual_user_id" as actor_workspace_user_id,
    coalesce(resolved.actor_auth_uid, linked_user."virtual_user_id") as actor_id,
    coalesce(
      actor_workspace_user."full_name",
      actor_workspace_user."display_name",
      actor_private_details."full_name",
      actor_user."display_name"
    ) as actor_name,
    coalesce(
      actor_workspace_user."email",
      actor_private_details."email"
    ) as actor_email,
    resolved.changed_fields,
    resolved.before,
    resolved.after
  from resolved
  left join "public"."workspace_user_groups" resolved_group
    on resolved_group."id" = resolved.resolved_group_id
  left join "public"."workspace_users" affected_user
    on affected_user."id" = resolved.affected_user_id
   and affected_user."ws_id" = p_ws_id
  left join "public"."workspace_user_linked_users" linked_user
    on linked_user."platform_user_id" = resolved.actor_auth_uid
   and linked_user."ws_id" = p_ws_id
  left join "public"."workspace_users" actor_workspace_user
    on actor_workspace_user."id" = linked_user."virtual_user_id"
   and actor_workspace_user."ws_id" = p_ws_id
  left join "public"."users" actor_user
    on actor_user."id" = resolved.actor_auth_uid
  left join "public"."user_private_details" actor_private_details
    on actor_private_details."user_id" = actor_user."id"
  where resolved.resolved_ws_id = p_ws_id;
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
  with filtered as (
    select *
    from private.user_group_activity_feed(p_ws_id, p_start, p_end) feed
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

create or replace function "private"."admin_create_workspace_user_group_with_audit_actor"(
  p_ws_id uuid,
  p_payload jsonb,
  p_actor_auth_uid uuid default null
)
returns "public"."workspace_user_groups"
language plpgsql
security definer
set search_path = public, audit
as $function$
declare
  created_row "public"."workspace_user_groups";
begin
  perform set_config('audit.override_auth_uid', coalesce(p_actor_auth_uid::text, ''), true);

  insert into "public"."workspace_user_groups" (
    "id",
    "name",
    "is_guest",
    "starting_date",
    "ending_date",
    "notes",
    "description",
    "ws_id"
  )
  values (
    coalesce(public.try_parse_uuid(p_payload->>'id'), gen_random_uuid()),
    nullif(p_payload->>'name', ''),
    coalesce(nullif(p_payload->>'is_guest', '')::boolean, false),
    nullif(p_payload->>'starting_date', '')::timestamptz,
    nullif(p_payload->>'ending_date', '')::timestamptz,
    nullif(p_payload->>'notes', ''),
    nullif(p_payload->>'description', ''),
    p_ws_id
  )
  returning * into created_row;

  return created_row;
end;
$function$;

create or replace function "private"."admin_update_workspace_user_group_with_audit_actor"(
  p_ws_id uuid,
  p_group_id uuid,
  p_payload jsonb,
  p_actor_auth_uid uuid default null
)
returns "public"."workspace_user_groups"
language plpgsql
security definer
set search_path = public, audit
as $function$
declare
  updated_row "public"."workspace_user_groups";
begin
  perform set_config('audit.override_auth_uid', coalesce(p_actor_auth_uid::text, ''), true);

  update "public"."workspace_user_groups" as workspace_group
  set
    "name" = case
      when p_payload ? 'name' then nullif(p_payload->>'name', '')
      else workspace_group."name"
    end,
    "is_guest" = case
      when p_payload ? 'is_guest' then nullif(p_payload->>'is_guest', '')::boolean
      else workspace_group."is_guest"
    end,
    "starting_date" = case
      when p_payload ? 'starting_date' then nullif(p_payload->>'starting_date', '')::timestamptz
      else workspace_group."starting_date"
    end,
    "ending_date" = case
      when p_payload ? 'ending_date' then nullif(p_payload->>'ending_date', '')::timestamptz
      else workspace_group."ending_date"
    end,
    "notes" = case
      when p_payload ? 'notes' then nullif(p_payload->>'notes', '')
      else workspace_group."notes"
    end,
    "description" = case
      when p_payload ? 'description' then nullif(p_payload->>'description', '')
      else workspace_group."description"
    end,
    "archived" = case
      when p_payload ? 'archived' then coalesce(nullif(p_payload->>'archived', '')::boolean, false)
      else workspace_group."archived"
    end,
    "is_course_published" = case
      when p_payload ? 'is_course_published' then coalesce(nullif(p_payload->>'is_course_published', '')::boolean, false)
      else workspace_group."is_course_published"
    end,
    "sessions" = case
      when not p_payload ? 'sessions' then workspace_group."sessions"
      when jsonb_typeof(p_payload->'sessions') = 'array' then (
        select coalesce(array_agg(session_value::date), array[]::date[])
        from jsonb_array_elements_text(p_payload->'sessions') as sessions(session_value)
      )
      else null
    end
  where workspace_group."ws_id" = p_ws_id
    and workspace_group."id" = p_group_id
  returning * into updated_row;

  return updated_row;
end;
$function$;

create or replace function "private"."admin_delete_workspace_user_group_with_audit_actor"(
  p_ws_id uuid,
  p_group_id uuid,
  p_actor_auth_uid uuid default null
)
returns "public"."workspace_user_groups"
language plpgsql
security definer
set search_path = public, audit
as $function$
declare
  deleted_row "public"."workspace_user_groups";
begin
  perform set_config('audit.override_auth_uid', coalesce(p_actor_auth_uid::text, ''), true);

  delete from "public"."workspace_user_groups"
  where "ws_id" = p_ws_id
    and "id" = p_group_id
  returning * into deleted_row;

  return deleted_row;
end;
$function$;

create or replace function "private"."admin_upsert_workspace_user_group_members_with_audit_actor"(
  p_ws_id uuid,
  p_group_id uuid,
  p_user_ids uuid[],
  p_role text default 'STUDENT',
  p_actor_auth_uid uuid default null
)
returns setof "public"."workspace_user_groups_users"
language plpgsql
security definer
set search_path = public, audit
as $function$
declare
  invalid_count integer;
begin
  if not exists (
    select 1
    from "public"."workspace_user_groups" workspace_group
    where workspace_group."id" = p_group_id
      and workspace_group."ws_id" = p_ws_id
  ) then
    raise exception 'user_group_not_found' using errcode = '42501';
  end if;

  select count(*)
  into invalid_count
  from unnest(coalesce(p_user_ids, array[]::uuid[])) as requested_user(user_id)
  left join "public"."workspace_users" workspace_user
    on workspace_user."id" = requested_user.user_id
   and workspace_user."ws_id" = p_ws_id
  where workspace_user."id" is null;

  if invalid_count > 0 then
    raise exception 'user_group_member_workspace_mismatch' using errcode = '42501';
  end if;

  perform set_config('audit.override_auth_uid', coalesce(p_actor_auth_uid::text, ''), true);

  return query
  insert into "public"."workspace_user_groups_users" (
    "group_id",
    "user_id",
    "role"
  )
  select distinct
    p_group_id,
    requested_user.user_id,
    coalesce(nullif(p_role, ''), 'STUDENT')
  from unnest(coalesce(p_user_ids, array[]::uuid[])) as requested_user(user_id)
  on conflict ("group_id", "user_id")
  do update set "role" = excluded."role"
  returning *;
end;
$function$;

create or replace function "private"."admin_delete_workspace_user_group_member_with_audit_actor"(
  p_ws_id uuid,
  p_group_id uuid,
  p_user_id uuid,
  p_actor_auth_uid uuid default null
)
returns "public"."workspace_user_groups_users"
language plpgsql
security definer
set search_path = public, audit
as $function$
declare
  deleted_row "public"."workspace_user_groups_users";
begin
  if not exists (
    select 1
    from "public"."workspace_user_groups" workspace_group
    where workspace_group."id" = p_group_id
      and workspace_group."ws_id" = p_ws_id
  ) then
    raise exception 'user_group_not_found' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from "public"."workspace_users" workspace_user
    where workspace_user."id" = p_user_id
      and workspace_user."ws_id" = p_ws_id
  ) then
    raise exception 'user_group_member_workspace_mismatch' using errcode = '42501';
  end if;

  perform set_config('audit.override_auth_uid', coalesce(p_actor_auth_uid::text, ''), true);

  delete from "public"."workspace_user_groups_users"
  where "group_id" = p_group_id
    and "user_id" = p_user_id
  returning * into deleted_row;

  return deleted_row;
end;
$function$;

revoke all on function "private"."user_group_activity_resource_type"(text) from public, anon, authenticated;
revoke all on function "private"."user_group_activity_action"(audit.operation, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function "private"."user_group_activity_feed"(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function "private"."list_user_group_activity_logs"(uuid, timestamptz, timestamptz, uuid, text, text, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function "private"."admin_create_workspace_user_group_with_audit_actor"(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function "private"."admin_update_workspace_user_group_with_audit_actor"(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function "private"."admin_delete_workspace_user_group_with_audit_actor"(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function "private"."admin_upsert_workspace_user_group_members_with_audit_actor"(uuid, uuid, uuid[], text, uuid) from public, anon, authenticated;
revoke all on function "private"."admin_delete_workspace_user_group_member_with_audit_actor"(uuid, uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function "private"."user_group_activity_resource_type"(text) to service_role;
grant execute on function "private"."user_group_activity_action"(audit.operation, text, jsonb, jsonb) to service_role;
grant execute on function "private"."user_group_activity_feed"(uuid, timestamptz, timestamptz) to service_role;
grant execute on function "private"."list_user_group_activity_logs"(uuid, timestamptz, timestamptz, uuid, text, text, text, text, text, integer, integer) to service_role;
grant execute on function "private"."admin_create_workspace_user_group_with_audit_actor"(uuid, jsonb, uuid) to service_role;
grant execute on function "private"."admin_update_workspace_user_group_with_audit_actor"(uuid, uuid, jsonb, uuid) to service_role;
grant execute on function "private"."admin_delete_workspace_user_group_with_audit_actor"(uuid, uuid, uuid) to service_role;
grant execute on function "private"."admin_upsert_workspace_user_group_members_with_audit_actor"(uuid, uuid, uuid[], text, uuid) to service_role;
grant execute on function "private"."admin_delete_workspace_user_group_member_with_audit_actor"(uuid, uuid, uuid, uuid) to service_role;
