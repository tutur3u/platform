-- Move user group metric category metadata off the public Data API surface.
--
-- User-group indicator APIs remain the owning boundary. Metric categories and
-- category links are read and written with service-role private schema access
-- after workspace permissions are verified by apps/web.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

alter table if exists public.user_group_metric_categories
  set schema private;

alter table if exists public.user_group_metric_category_links
  set schema private;

revoke all on table
  private.user_group_metric_categories,
  private.user_group_metric_category_links
from public, anon, authenticated;

grant all on table
  private.user_group_metric_categories,
  private.user_group_metric_category_links
to service_role;

alter table private.user_group_metric_categories enable row level security;
alter table private.user_group_metric_category_links enable row level security;

drop policy if exists "Enable all access for organization members"
  on private.user_group_metric_categories;

drop policy if exists "Enable all access for organization members"
  on private.user_group_metric_category_links;

drop policy if exists "Service role can manage private user group metric categories"
  on private.user_group_metric_categories;

drop policy if exists "Service role can manage private user group metric category links"
  on private.user_group_metric_category_links;

drop policy if exists "Service role can manage private metric categories"
  on private.user_group_metric_categories;

drop policy if exists "Service role can manage private metric category links"
  on private.user_group_metric_category_links;

create policy "Service role can manage private metric categories"
  on private.user_group_metric_categories
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage private metric category links"
  on private.user_group_metric_category_links
  for all
  to service_role
  using (true)
  with check (true);

drop function if exists public.get_user_group_metric_categories_count(uuid);

create or replace function private.get_user_group_metric_categories_count(
  p_ws_id uuid
)
returns numeric
language sql
security definer
set search_path = private, public
as $function$
  select count(*)::numeric
  from private.user_group_metric_categories category
  where category.ws_id = p_ws_id;
$function$;

revoke all on function private.get_user_group_metric_categories_count(uuid)
from public, anon, authenticated;

grant execute on function private.get_user_group_metric_categories_count(uuid)
to service_role;

create or replace function private.ensure_user_group_metric_category_ids(
  p_ws_id uuid,
  p_category_ids uuid[] default null
)
returns uuid[]
language plpgsql
security definer
set search_path = private, public
as $function$
declare
  unique_category_ids uuid[];
  valid_category_count integer;
begin
  select coalesce(array_agg(distinct category_id), array[]::uuid[])
  into unique_category_ids
  from unnest(coalesce(p_category_ids, array[]::uuid[])) as category_ids(category_id);

  if cardinality(unique_category_ids) = 0 then
    return unique_category_ids;
  end if;

  select count(*)::integer
  into valid_category_count
  from private.user_group_metric_categories category
  where category.ws_id = p_ws_id
    and category.id = any(unique_category_ids);

  if valid_category_count <> cardinality(unique_category_ids) then
    raise exception 'invalid_metric_category' using errcode = '22023';
  end if;

  return unique_category_ids;
end;
$function$;

revoke all on function private.ensure_user_group_metric_category_ids(uuid, uuid[])
from public, anon, authenticated;

grant execute on function private.ensure_user_group_metric_category_ids(uuid, uuid[])
to service_role;

create or replace function private.admin_create_user_group_metric_with_audit_actor(
  p_ws_id uuid,
  p_group_id uuid,
  p_payload jsonb,
  p_category_ids uuid[] default null,
  p_actor_auth_uid uuid default null
)
returns public.user_group_metrics
language plpgsql
security definer
set search_path = public, audit, private
as $function$
declare
  payload public.user_group_metrics;
  created_row public.user_group_metrics;
  valid_category_ids uuid[];
begin
  if not exists (
    select 1
    from public.workspace_user_groups workspace_group
    where workspace_group.id = p_group_id
      and workspace_group.ws_id = p_ws_id
  ) then
    return null;
  end if;

  valid_category_ids := private.ensure_user_group_metric_category_ids(
    p_ws_id,
    p_category_ids
  );
  payload := jsonb_populate_record(null::public.user_group_metrics, coalesce(p_payload, '{}'::jsonb));

  perform set_config('audit.override_auth_uid', coalesce(p_actor_auth_uid::text, ''), true);

  insert into public.user_group_metrics (
    id,
    name,
    unit,
    factor,
    is_weighted,
    ws_id,
    group_id
  )
  values (
    coalesce(payload.id, gen_random_uuid()),
    payload.name,
    coalesce(payload.unit, ''),
    coalesce(payload.factor, 1),
    coalesce(payload.is_weighted, true),
    p_ws_id,
    p_group_id
  )
  returning * into created_row;

  if cardinality(valid_category_ids) > 0 then
    insert into private.user_group_metric_category_links (
      category_id,
      metric_id
    )
    select category_id, created_row.id
    from unnest(valid_category_ids) as category_ids(category_id);
  end if;

  return created_row;
end;
$function$;

revoke all on function private.admin_create_user_group_metric_with_audit_actor(uuid, uuid, jsonb, uuid[], uuid)
from public, anon, authenticated;

grant execute on function private.admin_create_user_group_metric_with_audit_actor(uuid, uuid, jsonb, uuid[], uuid)
to service_role;

create or replace function private.admin_update_user_group_metric_with_audit_actor(
  p_ws_id uuid,
  p_metric_id uuid,
  p_payload jsonb,
  p_category_ids uuid[] default null,
  p_actor_auth_uid uuid default null
)
returns public.user_group_metrics
language plpgsql
security definer
set search_path = public, audit, private
as $function$
declare
  payload public.user_group_metrics;
  updated_row public.user_group_metrics;
  valid_category_ids uuid[];
begin
  if p_category_ids is not null then
    valid_category_ids := private.ensure_user_group_metric_category_ids(
      p_ws_id,
      p_category_ids
    );
  end if;

  payload := jsonb_populate_record(null::public.user_group_metrics, coalesce(p_payload, '{}'::jsonb));

  perform set_config('audit.override_auth_uid', coalesce(p_actor_auth_uid::text, ''), true);

  update public.user_group_metrics as metric
  set
    name = case when p_payload ? 'name' then payload.name else metric.name end,
    factor = case when p_payload ? 'factor' then coalesce(payload.factor, metric.factor) else metric.factor end,
    unit = case when p_payload ? 'unit' then coalesce(payload.unit, '') else metric.unit end,
    is_weighted = case when p_payload ? 'is_weighted' then coalesce(payload.is_weighted, true) else metric.is_weighted end,
    group_id = case when p_payload ? 'group_id' then payload.group_id else metric.group_id end
  where metric.ws_id = p_ws_id
    and metric.id = p_metric_id
  returning * into updated_row;

  if updated_row.id is null then
    return null;
  end if;

  if p_category_ids is not null then
    delete from private.user_group_metric_category_links
    where metric_id = p_metric_id;

    if cardinality(valid_category_ids) > 0 then
      insert into private.user_group_metric_category_links (
        category_id,
        metric_id
      )
      select category_id, p_metric_id
      from unnest(valid_category_ids) as category_ids(category_id);
    end if;
  end if;

  return updated_row;
end;
$function$;

revoke all on function private.admin_update_user_group_metric_with_audit_actor(uuid, uuid, jsonb, uuid[], uuid)
from public, anon, authenticated;

grant execute on function private.admin_update_user_group_metric_with_audit_actor(uuid, uuid, jsonb, uuid[], uuid)
to service_role;

drop index if exists audit.record_version_user_group_activity_ts_idx;

create index if not exists record_version_user_group_activity_ts_idx
  on audit.record_version (ts desc, id desc)
  where (
    table_schema = 'public'
    and table_name in (
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
      'user_indicators',
      'external_user_monthly_reports',
      'external_user_monthly_report_logs',
      'user_feedbacks',
      'workspace_course_modules',
      'workspace_course_module_groups'
    )
  )
  or (
    table_schema = 'private'
    and table_name in (
      'user_group_metric_categories',
      'user_group_metric_category_links'
    )
  );

create or replace function private.user_group_activity_feed(
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
            'user_group_posts',
            'user_group_post_logs',
            'user_group_post_checks',
            'user_group_attendance',
            'user_group_linked_products',
            'user_group_metrics',
            'user_indicators',
            'external_user_monthly_reports',
            'external_user_monthly_report_logs',
            'user_feedbacks',
            'workspace_course_modules',
            'workspace_course_module_groups'
          )
        )
        or (
          audit_log.table_schema = 'private'
          and audit_log.table_name in (
            'user_group_metric_categories',
            'user_group_metric_category_links'
          )
        )
      )
      and audit_log.ts >= p_start
      and audit_log.ts < p_end
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
    left join public.user_group_posts post_record
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
    left join public.external_user_monthly_reports report_record
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
  order by resolved.occurred_at desc, resolved.audit_record_id desc;
$function$;

comment on table private.user_group_metric_categories is
  'Private user-group metric category metadata served through apps/web user-group indicator APIs.';

comment on table private.user_group_metric_category_links is
  'Private user-group metric/category links maintained by apps/web indicator APIs and private RPCs.';

notify pgrst, 'reload schema';
