-- Scope group audit rows before computing snapshots and joining actors.
-- The three-argument feed remains available for existing internal callers;
-- the paginated Contacts RPC uses this scoped overload.

create or replace function private.user_group_activity_feed(
  p_ws_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_group_id uuid
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
      audit_log.id as audit_record_id,
      audit_log.table_name,
      audit_log.op,
      audit_log.ts as occurred_at,
      coalesce(audit_log.record, '{}'::jsonb) as next_record,
      coalesce(audit_log.old_record, '{}'::jsonb) as previous_record,
      audit_log.auth_uid as actor_auth_uid
    from audit.record_version audit_log
    where (
        (
          audit_log.table_schema = 'public'
          and audit_log.table_name in (
            'workspace_user_groups',
            'workspace_user_groups_users',
            'workspace_user_group_tag_groups',
            'workspace_default_included_user_groups',
            'user_group_attendance',
            'user_group_linked_products',
            'user_group_metrics',
            'user_indicators',
            'user_feedbacks',
            'workspace_course_modules',
            'workspace_course_module_groups'
          )
        )
        or (
          audit_log.table_schema = 'private'
          and audit_log.table_name in (
            'user_group_posts',
            'user_group_post_logs',
            'user_group_post_checks',
            'external_user_monthly_reports',
            'external_user_monthly_report_logs',
            'user_group_metric_categories',
            'user_group_metric_category_links'
          )
        )
      )
      and audit_log.ts >= p_start
      and audit_log.ts < p_end
      -- Narrow direct group/workspace events before snapshots and actor joins.
      -- Indirect resources keep the existing resolver path, including deleted
      -- records whose parent can no longer be found in current tables.
      and (
        coalesce(audit_log.record->>'ws_id', audit_log.old_record->>'ws_id') = p_ws_id::text
        or coalesce(audit_log.record->>'group_id', audit_log.old_record->>'group_id') in (
          select scoped_group.id::text
          from public.workspace_user_groups scoped_group
          where scoped_group.ws_id = p_ws_id
            and (p_group_id is null or scoped_group.id = p_group_id)
        )
        or (
          audit_log.table_name = 'workspace_user_groups'
          and coalesce(audit_log.record->>'id', audit_log.old_record->>'id') in (
            select scoped_group.id::text
            from public.workspace_user_groups scoped_group
            where scoped_group.ws_id = p_ws_id
              and (p_group_id is null or scoped_group.id = p_group_id)
          )
        )
        or audit_log.table_name in (
          'user_group_post_logs', 'user_group_post_checks',
          'user_indicators', 'user_group_metric_category_links',
          'external_user_monthly_report_logs'
        )
        or (
          audit_log.table_name = 'user_feedbacks'
          and coalesce(audit_log.record->>'group_id', audit_log.old_record->>'group_id') is null
        )
      )
  ),
  normalized as (
    select
      audit_rows.*,
      private.user_group_activity_action(
        audit_rows.op,
        audit_rows.table_name,
        audit_rows.next_record,
        audit_rows.previous_record
      ) as action,
      private.user_group_activity_resource_type(audit_rows.table_name) as resource_type,
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
          when normalized.table_name = 'workspace_user_groups'
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
          when normalized.table_name = 'user_group_posts'
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
          when normalized.table_name = 'user_group_metrics'
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
          when normalized.table_name = 'user_group_metric_categories'
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
          when normalized.table_name = 'workspace_course_modules'
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
          when normalized.table_name = 'workspace_course_module_groups'
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
          when normalized.table_name = 'external_user_monthly_reports'
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
        post_record.group_id,
        metric_record.group_id,
        module_record.group_id,
        module_group_record.group_id,
        report_record.group_id
      ) as resolved_group_id,
      coalesce(
        public.try_parse_uuid(ids.next_record->>'ws_id'),
        public.try_parse_uuid(ids.previous_record->>'ws_id'),
        direct_group.ws_id,
        post_group.ws_id,
        metric_record.ws_id,
        category_record.ws_id,
        module_group_parent.ws_id,
        report_group.ws_id,
        affected_user_record.ws_id
      ) as resolved_ws_id,
      coalesce(
        nullif(ids.next_record->>'name', ''),
        nullif(ids.previous_record->>'name', ''),
        nullif(ids.next_record->>'title', ''),
        nullif(ids.previous_record->>'title', ''),
        post_record.title,
        metric_record.name,
        category_record.name,
        module_record.name,
        module_group_record.title,
        report_record.title,
        product_record.name,
        tag_record.name,
        coalesce(affected_user_record.full_name, affected_user_record.display_name, affected_user_record.email),
        nullif(left(coalesce(ids.next_record->>'content', ids.previous_record->>'content', ''), 80), '')
      ) as resolved_resource_label
    from ids
    left join public.workspace_user_groups direct_group
      on direct_group.id = ids.direct_group_id
    left join private.user_group_posts post_record
      on post_record.id = ids.post_id
    left join public.workspace_user_groups post_group
      on post_group.id = post_record.group_id
    left join public.user_group_metrics metric_record
      on metric_record.id = ids.metric_id
    left join private.user_group_metric_categories category_record
      on category_record.id = ids.category_id
    left join public.workspace_course_modules module_record
      on module_record.id = ids.module_id
    left join public.workspace_course_module_groups module_group_record
      on module_group_record.id = ids.module_group_id
    left join public.workspace_user_groups module_group_parent
      on module_group_parent.id = coalesce(module_record.group_id, module_group_record.group_id)
    left join private.external_user_monthly_reports report_record
      on report_record.id = ids.report_id
    left join public.workspace_user_groups report_group
      on report_group.id = report_record.group_id
    left join public.workspace_products product_record
      on product_record.id = ids.product_id
    left join public.workspace_user_group_tags tag_record
      on tag_record.id = ids.tag_id
    left join public.workspace_users affected_user_record
      on affected_user_record.id = ids.affected_user_id
  )
  select
    resolved.audit_record_id,
    resolved.table_name,
    resolved.action,
    resolved.resource_type,
    resolved.occurred_at,
    resolved_group.id as group_id,
    resolved_group.name as group_name,
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
      affected_user.full_name,
      affected_user.display_name,
      nullif(resolved.next_record->>'full_name', ''),
      nullif(resolved.previous_record->>'full_name', '')
    ) as affected_user_name,
    coalesce(
      affected_user.email,
      nullif(resolved.next_record->>'email', ''),
      nullif(resolved.previous_record->>'email', '')
    ) as affected_user_email,
    resolved.actor_auth_uid,
    linked_user.virtual_user_id as actor_workspace_user_id,
    coalesce(resolved.actor_auth_uid, linked_user.virtual_user_id) as actor_id,
    coalesce(
      actor_workspace_user.full_name,
      actor_workspace_user.display_name,
      actor_private_details.full_name,
      actor_user.display_name,
      actor_private_details.email
    ) as actor_name,
    coalesce(
      actor_workspace_user.email,
      actor_private_details.email
    ) as actor_email,
    resolved.changed_fields,
    resolved.before,
    resolved.after
  from resolved
  left join public.workspace_user_groups resolved_group
    on resolved_group.id = resolved.resolved_group_id
  left join public.workspace_users affected_user
    on affected_user.id = resolved.affected_user_id
  left join public.workspace_user_linked_users linked_user
    on linked_user.platform_user_id = resolved.actor_auth_uid
    and linked_user.ws_id = resolved.resolved_ws_id
  left join public.workspace_users actor_workspace_user
    on actor_workspace_user.id = linked_user.virtual_user_id
  left join public.users actor_user
    on actor_user.id = resolved.actor_auth_uid
  left join public.user_private_details actor_private_details
    on actor_private_details.user_id = resolved.actor_auth_uid
  where resolved.resolved_ws_id = p_ws_id
    and (p_group_id is null or resolved.resolved_group_id = p_group_id)
  order by resolved.occurred_at desc, resolved.audit_record_id desc;
$function$;

revoke all on function private.user_group_activity_feed(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function private.user_group_activity_feed(uuid, timestamptz, timestamptz, uuid) to service_role;

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
        fallback_actor."display_name",
        fallback_private."full_name",
        fallback_platform_user."display_name",
        fallback_private."email"
      ) as actor_name,
      coalesce(
        feed.actor_email,
        fallback_actor."email",
        fallback_private."email"
      ) as actor_email,
      feed.changed_fields,
      feed.before,
      feed.after
    from private.user_group_activity_feed(p_ws_id, p_start, p_end, p_group_id) feed
    left join "public"."workspace_users" fallback_actor
      on fallback_actor."id" = private.user_group_activity_actor_workspace_user_id(feed.before, feed.after)
    left join "public"."workspace_user_linked_users" fallback_linked
      on fallback_linked."virtual_user_id" = fallback_actor."id"
    left join "public"."users" fallback_platform_user
      on fallback_platform_user."id" = fallback_linked."platform_user_id"
    left join "public"."user_private_details" fallback_private
      on fallback_private."user_id" = fallback_linked."platform_user_id"
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

notify pgrst, 'reload schema';
