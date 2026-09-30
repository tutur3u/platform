-- Extract candidate anchor fields together so wide TOASTed snapshots are not
-- fetched repeatedly for every parent join. Eligibility and precedence are unchanged.
create or replace function private.user_group_activity_candidates(
  p_ws_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_group_id uuid
)
returns table (audit_record_id bigint, occurred_at timestamptz)
language sql
security definer
set search_path = public, audit, private
as $function$
  with scoped_groups as materialized (
    select p_group_id::text as id
    where p_group_id is not null
    union
    select group_record.id::text
    from public.workspace_user_groups group_record
    where p_group_id is null and group_record.ws_id = p_ws_id
    union
    select coalesce(history.record->>'id', history.old_record->>'id')
    from audit.record_version history
    where p_group_id is null
      and history.table_schema = 'public'
      and history.table_name = 'workspace_user_groups'
      and coalesce(history.record->>'ws_id', history.old_record->>'ws_id') = p_ws_id::text
      and coalesce(history.record->>'id', history.old_record->>'id') is not null
  ),
  scoped_parents as materialized (
    select post_record.id::text as id
    from private.user_group_posts post_record
    join scoped_groups scoped on scoped.id = post_record.group_id::text
    union
    select metric_record.id::text
    from public.user_group_metrics metric_record
    join scoped_groups scoped on scoped.id = metric_record.group_id::text
    union
    select report_record.id::text
    from private.external_user_monthly_reports report_record
    join scoped_groups scoped on scoped.id = report_record.group_id::text
  ),
  audit_rows as (
    -- Direct resources use the group-key index. A historical group id keeps
    -- membership and attendance rows visible after the group is deleted.
    select
      audit_log.id as audit_record_id,
      audit_log.table_name,
      audit_log.op,
      audit_log.ts as occurred_at,
      coalesce(audit_log.record, '{}'::jsonb) as next_record,
      coalesce(audit_log.old_record, '{}'::jsonb) as previous_record,
      audit_log.auth_uid as actor_auth_uid
    from scoped_groups scoped
    join audit.record_version audit_log
      on coalesce(audit_log.record->>'group_id', audit_log.old_record->>'group_id') = scoped.id
    where audit_log.ts >= p_start and audit_log.ts < p_end
      and (
        (audit_log.table_schema = 'public' and audit_log.table_name in (
          'workspace_user_groups_users', 'workspace_user_group_tag_groups',
          'workspace_default_included_user_groups', 'user_group_attendance',
          'user_group_linked_products', 'user_group_metrics', 'user_feedbacks',
          'workspace_course_modules', 'workspace_course_module_groups'
        ))
        or (audit_log.table_schema = 'private' and audit_log.table_name in (
          'user_group_posts', 'external_user_monthly_reports'
        ))
      )
    union all
    -- Group metadata and metric categories carry their own workspace id.
    select
      audit_log.id as audit_record_id,
      audit_log.table_name,
      audit_log.op,
      audit_log.ts as occurred_at,
      coalesce(audit_log.record, '{}'::jsonb) as next_record,
      coalesce(audit_log.old_record, '{}'::jsonb) as previous_record,
      audit_log.auth_uid as actor_auth_uid
    from audit.record_version audit_log
    where audit_log.ts >= p_start and audit_log.ts < p_end
      and coalesce(audit_log.record->>'ws_id', audit_log.old_record->>'ws_id') = p_ws_id::text
      and (
        (audit_log.table_schema = 'public' and audit_log.table_name = 'workspace_user_groups')
        or (audit_log.table_schema = 'private' and audit_log.table_name = 'user_group_metric_categories')
      )
    union all
    -- Child rows use the parent-key index before snapshot/actor enrichment.
    select
      audit_log.id as audit_record_id,
      audit_log.table_name,
      audit_log.op,
      audit_log.ts as occurred_at,
      coalesce(audit_log.record, '{}'::jsonb) as next_record,
      coalesce(audit_log.old_record, '{}'::jsonb) as previous_record,
      audit_log.auth_uid as actor_auth_uid
    from scoped_parents parent
    join audit.record_version audit_log
      on coalesce(
        audit_log.record->>'post_id', audit_log.old_record->>'post_id',
        audit_log.record->>'metric_id', audit_log.old_record->>'metric_id',
        audit_log.record->>'indicator_id', audit_log.old_record->>'indicator_id',
        audit_log.record->>'report_id', audit_log.old_record->>'report_id'
      ) = parent.id
    where audit_log.ts >= p_start and audit_log.ts < p_end
      and (
        (audit_log.table_schema = 'public' and audit_log.table_name = 'user_indicators')
        or (audit_log.table_schema = 'private' and audit_log.table_name in (
          'user_group_post_logs', 'user_group_post_checks',
          'user_group_metric_category_links', 'external_user_monthly_report_logs'
        ))
      )
    union all
    -- These events resolve through a workspace user when they have no current
    -- group or metric parent. Start from that workspace's users so this branch
    -- never scans every user's audit rows for the month.
    select
      audit_log.id as audit_record_id,
      audit_log.table_name,
      audit_log.op,
      audit_log.ts as occurred_at,
      coalesce(audit_log.record, '{}'::jsonb) as next_record,
      coalesce(audit_log.old_record, '{}'::jsonb) as previous_record,
      audit_log.auth_uid as actor_auth_uid
    from public.workspace_users scoped_user
    join audit.record_version audit_log
      on coalesce(audit_log.record->>'user_id', audit_log.old_record->>'user_id') = scoped_user.id::text
    where p_group_id is null
      and scoped_user.ws_id = p_ws_id
      and audit_log.ts >= p_start and audit_log.ts < p_end
      and (
        (audit_log.table_schema = 'public' and audit_log.table_name = 'user_feedbacks'
          and coalesce(audit_log.record->>'group_id', audit_log.old_record->>'group_id') is null)
        or (audit_log.table_schema = 'public' and audit_log.table_name = 'user_indicators'
          and not exists (
            select 1 from public.user_group_metrics metric_record
            where metric_record.id = public.try_parse_uuid(coalesce(
              audit_log.record->>'metric_id', audit_log.old_record->>'metric_id',
              audit_log.record->>'indicator_id', audit_log.old_record->>'indicator_id'
            ))
          ))
      )
    union all
    -- A category remains a workspace anchor when its linked metric is gone.
    select
      audit_log.id as audit_record_id,
      audit_log.table_name,
      audit_log.op,
      audit_log.ts as occurred_at,
      coalesce(audit_log.record, '{}'::jsonb) as next_record,
      coalesce(audit_log.old_record, '{}'::jsonb) as previous_record,
      audit_log.auth_uid as actor_auth_uid
    from private.user_group_metric_categories scoped_category
    join audit.record_version audit_log
      on coalesce(audit_log.record->>'category_id', audit_log.old_record->>'category_id') = scoped_category.id::text
    where p_group_id is null
      and scoped_category.ws_id = p_ws_id
      and audit_log.ts >= p_start and audit_log.ts < p_end
      and audit_log.table_schema = 'private'
      and audit_log.table_name = 'user_group_metric_category_links'
      and not exists (
        select 1 from public.user_group_metrics metric_record
        where metric_record.id = public.try_parse_uuid(coalesce(
          audit_log.record->>'metric_id', audit_log.old_record->>'metric_id'
        ))
      )
  ),
  normalized as (
    -- Every supported row operation has a non-null activity action. Counting
    -- identities must not classify actions or diff wide snapshots for all rows;
    -- the selected page still uses the full action helper during enrichment.
    -- A single record expansion reads each snapshot once for all anchor fields.
    -- Malformed non-object history retains the previous null-field behavior.
    select audit_rows.*,
      next_fields.id as next_id, previous_fields.id as previous_id,
      next_fields.ws_id as next_ws_id, previous_fields.ws_id as previous_ws_id,
      next_fields.group_id as next_group_id, previous_fields.group_id as previous_group_id,
      next_fields.user_id as next_user_id, previous_fields.user_id as previous_user_id,
      next_fields.post_id as next_post_id, previous_fields.post_id as previous_post_id,
      next_fields.metric_id as next_metric_id, previous_fields.metric_id as previous_metric_id,
      next_fields.indicator_id as next_indicator_id, previous_fields.indicator_id as previous_indicator_id,
      next_fields.category_id as next_category_id, previous_fields.category_id as previous_category_id,
      next_fields.module_id as next_module_id, previous_fields.module_id as previous_module_id,
      next_fields.module_group_id as next_module_group_id, previous_fields.module_group_id as previous_module_group_id,
      next_fields.report_id as next_report_id, previous_fields.report_id as previous_report_id,
      next_fields.product_id as next_product_id, previous_fields.product_id as previous_product_id,
      next_fields.tag_id as next_tag_id, previous_fields.tag_id as previous_tag_id
    from audit_rows
    cross join lateral jsonb_to_record(case when jsonb_typeof(audit_rows.next_record) = 'object' then audit_rows.next_record else '{}'::jsonb end) as next_fields(id text, ws_id text, group_id text, user_id text, post_id text, metric_id text, indicator_id text, category_id text, module_id text, module_group_id text, report_id text, product_id text, tag_id text)
    cross join lateral jsonb_to_record(case when jsonb_typeof(audit_rows.previous_record) = 'object' then audit_rows.previous_record else '{}'::jsonb end) as previous_fields(id text, ws_id text, group_id text, user_id text, post_id text, metric_id text, indicator_id text, category_id text, module_id text, module_group_id text, report_id text, product_id text, tag_id text)
    where audit_rows.op in ('INSERT', 'UPDATE', 'DELETE')
  ),
  ids as (
    select
      normalized.*,
      coalesce(
        public.try_parse_uuid(normalized.next_group_id),
        public.try_parse_uuid(normalized.previous_group_id),
        case
          when normalized.table_name = 'workspace_user_groups'
            then coalesce(
              public.try_parse_uuid(normalized.next_id),
              public.try_parse_uuid(normalized.previous_id)
            )
        end
      ) as direct_group_id,
      coalesce(
        public.try_parse_uuid(normalized.next_user_id),
        public.try_parse_uuid(normalized.previous_user_id)
      ) as affected_user_id,
      coalesce(
        public.try_parse_uuid(normalized.next_post_id),
        public.try_parse_uuid(normalized.previous_post_id),
        case
          when normalized.table_name = 'user_group_posts'
            then coalesce(
              public.try_parse_uuid(normalized.next_id),
              public.try_parse_uuid(normalized.previous_id)
            )
        end
      ) as post_id,
      coalesce(
        public.try_parse_uuid(normalized.next_metric_id),
        public.try_parse_uuid(normalized.previous_metric_id),
        public.try_parse_uuid(normalized.next_indicator_id),
        public.try_parse_uuid(normalized.previous_indicator_id),
        case
          when normalized.table_name = 'user_group_metrics'
            then coalesce(
              public.try_parse_uuid(normalized.next_id),
              public.try_parse_uuid(normalized.previous_id)
            )
        end
      ) as metric_id,
      coalesce(
        public.try_parse_uuid(normalized.next_category_id),
        public.try_parse_uuid(normalized.previous_category_id),
        case
          when normalized.table_name = 'user_group_metric_categories'
            then coalesce(
              public.try_parse_uuid(normalized.next_id),
              public.try_parse_uuid(normalized.previous_id)
            )
        end
      ) as category_id,
      coalesce(
        public.try_parse_uuid(normalized.next_module_id),
        public.try_parse_uuid(normalized.previous_module_id),
        case
          when normalized.table_name = 'workspace_course_modules'
            then coalesce(
              public.try_parse_uuid(normalized.next_id),
              public.try_parse_uuid(normalized.previous_id)
            )
        end
      ) as module_id,
      coalesce(
        public.try_parse_uuid(normalized.next_module_group_id),
        public.try_parse_uuid(normalized.previous_module_group_id),
        case
          when normalized.table_name = 'workspace_course_module_groups'
            then coalesce(
              public.try_parse_uuid(normalized.next_id),
              public.try_parse_uuid(normalized.previous_id)
            )
        end
      ) as module_group_id,
      coalesce(
        public.try_parse_uuid(normalized.next_report_id),
        public.try_parse_uuid(normalized.previous_report_id),
        case
          when normalized.table_name = 'external_user_monthly_reports'
            then coalesce(
              public.try_parse_uuid(normalized.next_id),
              public.try_parse_uuid(normalized.previous_id)
            )
        end
      ) as report_id,
      coalesce(
        public.try_parse_uuid(normalized.next_product_id),
        public.try_parse_uuid(normalized.previous_product_id)
      ) as product_id,
      coalesce(
        public.try_parse_uuid(normalized.next_tag_id),
        public.try_parse_uuid(normalized.previous_tag_id)
      ) as tag_id
    from normalized
  ),
  resolved as (
    select ids.audit_record_id, ids.occurred_at,
      coalesce(
        ids.direct_group_id, post_record.group_id, metric_record.group_id,
        module_record.group_id, module_group_record.group_id,
        report_record.group_id
      ) as resolved_group_id,
      coalesce(
        public.try_parse_uuid(ids.next_ws_id),
        public.try_parse_uuid(ids.previous_ws_id),
        direct_group.ws_id, post_group.ws_id, metric_record.ws_id,
        category_record.ws_id, module_group_parent.ws_id,
        report_group.ws_id, affected_user_record.ws_id
      ) as resolved_ws_id
    from ids
    left join public.workspace_user_groups direct_group on direct_group.id = ids.direct_group_id
    left join private.user_group_posts post_record on post_record.id = ids.post_id
    left join public.workspace_user_groups post_group on post_group.id = post_record.group_id
    left join public.user_group_metrics metric_record on metric_record.id = ids.metric_id
    left join private.user_group_metric_categories category_record on category_record.id = ids.category_id
    left join public.workspace_course_modules module_record on module_record.id = ids.module_id
    left join public.workspace_course_module_groups module_group_record on module_group_record.id = ids.module_group_id
    left join public.workspace_user_groups module_group_parent
      on module_group_parent.id = coalesce(module_record.group_id, module_group_record.group_id)
    left join private.external_user_monthly_reports report_record on report_record.id = ids.report_id
    left join public.workspace_user_groups report_group on report_group.id = report_record.group_id
    left join public.workspace_users affected_user_record on affected_user_record.id = ids.affected_user_id
  )
  select resolved.audit_record_id, resolved.occurred_at
  from resolved
  where resolved.resolved_ws_id = p_ws_id
    and (p_group_id is null or resolved.resolved_group_id = p_group_id);
$function$;
revoke all on function private.user_group_activity_candidates(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function private.user_group_activity_candidates(uuid, timestamptz, timestamptz, uuid) to service_role;
