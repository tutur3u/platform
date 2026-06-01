create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

do $$
begin
  if to_regclass('public.external_user_monthly_reports') is not null then
    alter table public.external_user_monthly_reports set schema private;
  end if;

  if to_regclass('public.external_user_monthly_report_logs') is not null then
    alter table public.external_user_monthly_report_logs set schema private;
  end if;
end;
$$;

alter table private.external_user_monthly_reports enable row level security;
alter table private.external_user_monthly_report_logs enable row level security;

revoke all on table private.external_user_monthly_reports
  from public, anon, authenticated;
revoke all on table private.external_user_monthly_report_logs
  from public, anon, authenticated;

grant select, insert, update, delete on table private.external_user_monthly_reports
  to service_role;
grant select, insert, update, delete on table private.external_user_monthly_report_logs
  to service_role;

drop policy if exists "Service role can manage private external user monthly reports"
  on private.external_user_monthly_reports;
drop policy if exists "Service role can manage private report logs"
  on private.external_user_monthly_report_logs;
drop policy if exists "Service role can manage private external user monthly report lo"
  on private.external_user_monthly_report_logs;

create policy "Service role can manage private external user monthly reports"
  on private.external_user_monthly_reports
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage private report logs"
  on private.external_user_monthly_report_logs
  for all
  to service_role
  using (true)
  with check (true);

drop trigger if exists trg_report_approval
  on private.external_user_monthly_reports;
drop trigger if exists trg_report_change_log
  on private.external_user_monthly_reports;
drop trigger if exists trg_notify_report_approval
  on private.external_user_monthly_reports;

drop function if exists public.handle_report_approval();
drop function if exists public.log_report_change();
drop function if exists public.notify_report_approval_change();
drop function if exists public.get_report_workspace_id(uuid);

create or replace function private.get_report_workspace_id(p_report_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to public, private, pg_temp
as $$
declare
  v_ws_id uuid;
begin
  select wug.ws_id
    into v_ws_id
    from private.external_user_monthly_reports r
    join public.workspace_user_groups wug
      on wug.id = r.group_id
   where r.id = p_report_id;

  return v_ws_id;
end;
$$;

create or replace function private.handle_report_approval()
returns trigger
language plpgsql
security definer
set search_path to public, private, pg_temp
as $$
declare
  v_ws_id uuid;
  v_user_id uuid;
  v_has_approve_permission boolean;
  v_has_create_permission boolean;
  v_enable_approval boolean;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_ws_id := private.get_report_workspace_id(new.id);
  else
    select ws_id
      into v_ws_id
      from public.workspace_user_groups
     where id = new.group_id;
  end if;

  select coalesce(value = 'true', true)
    into v_enable_approval
    from public.workspace_configs
   where ws_id = v_ws_id
     and id = 'ENABLE_REPORT_APPROVAL';

  v_has_approve_permission := public.has_workspace_permission(
    v_ws_id,
    v_user_id,
    'approve_reports'
  );
  v_has_create_permission := public.has_workspace_permission(
    v_ws_id,
    v_user_id,
    'create_user_groups_reports'
  );

  if not v_enable_approval then
    if v_has_create_permission then
      new.report_approval_status := 'APPROVED';
      new.approved_by := v_user_id;
      new.approved_at := now();
      new.rejected_by := null;
      new.rejected_at := null;
      new.rejection_reason := null;
    end if;
    return new;
  end if;

  if v_has_approve_permission then
    if new.report_approval_status = 'PENDING' and v_has_create_permission then
      new.report_approval_status := 'APPROVED';
    end if;

    if new.report_approval_status = 'REJECTED' then
      if new.rejection_reason is null or new.rejection_reason = '' then
        raise exception 'rejection_reason is required when rejecting a report';
      end if;

      if new.rejected_by is null then
        new.rejected_by := v_user_id;
      end if;
      if new.rejected_at is null then
        new.rejected_at := now();
      end if;

      new.approved_by := null;
      new.approved_at := null;
    elsif new.report_approval_status = 'APPROVED' then
      if new.approved_by is null then
        new.approved_by := v_user_id;
      end if;
      if new.approved_at is null then
        new.approved_at := now();
      end if;

      new.rejected_by := null;
      new.rejected_at := null;
      new.rejection_reason := null;
    end if;
  else
    if tg_op = 'UPDATE' and (
      new.report_approval_status is distinct from old.report_approval_status
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
      or new.rejected_by is distinct from old.rejected_by
      or new.rejected_at is distinct from old.rejected_at
      or new.rejection_reason is distinct from old.rejection_reason
    ) then
      raise exception 'You do not have permission to modify approval fields';
    end if;

    new.report_approval_status := 'PENDING';
    new.approved_by := null;
    new.approved_at := null;
    new.rejected_by := null;
    new.rejected_at := null;
    new.rejection_reason := null;
  end if;

  return new;
end;
$$;

create or replace function private.log_report_change()
returns trigger
language plpgsql
security definer
set search_path to public, private, pg_temp
as $$
declare
  v_ws_id uuid;
  v_modifier_id uuid;
begin
  select ws_id
    into v_ws_id
    from public.workspace_user_groups
   where id = new.group_id;

  if auth.uid() is not null then
    v_modifier_id := public.get_workspace_user_id(auth.uid(), v_ws_id);
  end if;

  insert into private.external_user_monthly_report_logs (
    report_id,
    user_id,
    group_id,
    title,
    content,
    feedback,
    score,
    scores,
    creator_id,
    created_at,
    report_approval_status,
    approved_by,
    approved_at,
    rejected_by,
    rejected_at,
    rejection_reason
  )
  values (
    new.id,
    new.user_id,
    new.group_id,
    new.title,
    new.content,
    new.feedback,
    new.score,
    new.scores,
    coalesce(v_modifier_id, new.creator_id),
    now(),
    new.report_approval_status,
    new.approved_by,
    new.approved_at,
    new.rejected_by,
    new.rejected_at,
    new.rejection_reason
  );

  return new;
end;
$$;

create or replace function private.notify_report_approval_change()
returns trigger
language plpgsql
security definer
set search_path to public, private, pg_temp
as $$
declare
  v_ws_id uuid;
  v_platform_user_id uuid;
  v_reviewer_platform_user_id uuid;
  v_reviewer_name text;
  v_report_title text;
  v_notification_type text;
  v_notification_title text;
  v_notification_description text;
  v_data jsonb;
begin
  if old.report_approval_status is not distinct from new.report_approval_status then
    return new;
  end if;

  if new.report_approval_status not in ('APPROVED', 'REJECTED') then
    return new;
  end if;

  select ws_id
    into v_ws_id
    from public.workspace_users
   where id = new.creator_id;

  if v_ws_id is null then
    return new;
  end if;

  select platform_user_id
    into v_platform_user_id
    from public.workspace_user_linked_users
   where virtual_user_id = new.creator_id
     and ws_id = v_ws_id
   limit 1;

  if v_platform_user_id is null then
    return new;
  end if;

  if new.report_approval_status = 'APPROVED' and new.approved_by = new.creator_id then
    return new;
  end if;

  if new.report_approval_status = 'REJECTED' and new.rejected_by = new.creator_id then
    return new;
  end if;

  if new.report_approval_status = 'APPROVED' then
    select full_name
      into v_reviewer_name
      from public.workspace_users
     where id = new.approved_by;

    select platform_user_id
      into v_reviewer_platform_user_id
      from public.workspace_user_linked_users
     where virtual_user_id = new.approved_by
       and ws_id = v_ws_id
     limit 1;
  else
    select full_name
      into v_reviewer_name
      from public.workspace_users
     where id = new.rejected_by;

    select platform_user_id
      into v_reviewer_platform_user_id
      from public.workspace_user_linked_users
     where virtual_user_id = new.rejected_by
       and ws_id = v_ws_id
     limit 1;
  end if;

  v_report_title := coalesce(nullif(new.title, ''), 'Untitled Report');

  if new.report_approval_status = 'APPROVED' then
    v_notification_type := 'report_approved';
    v_notification_title := 'Report approved';
    v_notification_description := coalesce(v_reviewer_name, 'Someone') || ' approved "' || v_report_title || '"';
    v_data := jsonb_build_object(
      'report_id', new.id,
      'report_title', v_report_title,
      'group_id', new.group_id,
      'reviewer_name', v_reviewer_name
    );
  else
    v_notification_type := 'report_rejected';
    v_notification_title := 'Report rejected';
    v_notification_description := coalesce(v_reviewer_name, 'Someone') || ' rejected "' || v_report_title || '"';
    v_data := jsonb_build_object(
      'report_id', new.id,
      'report_title', v_report_title,
      'group_id', new.group_id,
      'reviewer_name', v_reviewer_name,
      'rejection_reason', new.rejection_reason
    );
  end if;

  perform public.create_notification(
    p_ws_id := v_ws_id,
    p_user_id := v_platform_user_id,
    p_type := v_notification_type,
    p_title := v_notification_title,
    p_description := v_notification_description,
    p_data := v_data,
    p_entity_type := 'report',
    p_entity_id := new.id,
    p_created_by := v_reviewer_platform_user_id
  );

  return new;
end;
$$;

create trigger trg_report_approval
before insert or update
on private.external_user_monthly_reports
for each row
execute function private.handle_report_approval();

create trigger trg_report_change_log
after insert or update
on private.external_user_monthly_reports
for each row
when (new.report_approval_status = 'APPROVED'::approval_status)
execute function private.log_report_change();

create trigger trg_notify_report_approval
after update
on private.external_user_monthly_reports
for each row
when (old.report_approval_status is distinct from new.report_approval_status)
execute function private.notify_report_approval_change();

revoke execute on function private.get_report_workspace_id(uuid)
  from public, anon, authenticated;
grant execute on function private.get_report_workspace_id(uuid)
  to service_role;

revoke execute on function private.handle_report_approval()
  from public, anon, authenticated;
grant execute on function private.handle_report_approval()
  to service_role;

revoke execute on function private.log_report_change()
  from public, anon, authenticated;
grant execute on function private.log_report_change()
  to service_role;

revoke execute on function private.notify_report_approval_change()
  from public, anon, authenticated;
grant execute on function private.notify_report_approval_change()
  to service_role;

drop view if exists private.external_user_monthly_report_logs_workspace_view;
drop view if exists private.external_user_monthly_reports_workspace_view;

create view private.external_user_monthly_reports_workspace_view as
select
  reports.*,
  report_user.ws_id as user_ws_id,
  report_user.full_name as user_full_name,
  report_user.display_name as user_display_name,
  report_user.email as user_email,
  report_user.archived as user_archived,
  report_user.archived_until as user_archived_until,
  report_user.note as user_note,
  report_group.ws_id as group_ws_id,
  report_group.name as group_name,
  creator.full_name as creator_full_name,
  creator.display_name as creator_display_name,
  creator.email as creator_email,
  modifier.full_name as modifier_full_name,
  modifier.display_name as modifier_display_name,
  modifier.email as modifier_email
from private.external_user_monthly_reports reports
left join public.workspace_users report_user
  on report_user.id = reports.user_id
left join public.workspace_user_groups report_group
  on report_group.id = reports.group_id
left join public.workspace_users creator
  on creator.id = reports.creator_id
left join public.workspace_users modifier
  on modifier.id = reports.updated_by;

create view private.external_user_monthly_report_logs_workspace_view as
select
  logs.*,
  report_user.ws_id as user_ws_id,
  report_user.full_name as user_full_name,
  report_user.display_name as user_display_name,
  report_user.email as user_email,
  report_group.ws_id as group_ws_id,
  report_group.name as group_name,
  creator.full_name as creator_full_name,
  creator.display_name as creator_display_name,
  creator.email as creator_email,
  reports.user_id as report_user_id
from private.external_user_monthly_report_logs logs
left join private.external_user_monthly_reports reports
  on reports.id = logs.report_id
left join public.workspace_users report_user
  on report_user.id = logs.user_id
left join public.workspace_user_groups report_group
  on report_group.id = logs.group_id
left join public.workspace_users creator
  on creator.id = logs.creator_id;

revoke all on table private.external_user_monthly_reports_workspace_view
  from public, anon, authenticated;
revoke all on table private.external_user_monthly_report_logs_workspace_view
  from public, anon, authenticated;

grant select on table private.external_user_monthly_reports_workspace_view
  to service_role;
grant select on table private.external_user_monthly_report_logs_workspace_view
  to service_role;

create or replace function public.get_group_report_status_summary(_ws_id uuid)
returns table (
  group_id uuid,
  pending_count bigint,
  approved_count bigint,
  rejected_count bigint
)
language sql
stable
security definer
set search_path to public, private, pg_temp
as $$
  select
    r.group_id,
    count(*) filter (where r.report_approval_status = 'PENDING') as pending_count,
    count(*) filter (where r.report_approval_status = 'APPROVED') as approved_count,
    count(*) filter (where r.report_approval_status = 'REJECTED') as rejected_count
  from private.external_user_monthly_reports r
  join public.workspace_user_groups g on g.id = r.group_id
  where g.ws_id = _ws_id
  group by r.group_id;
$$;

create or replace function public.get_user_report_status_summary(
  _group_id uuid,
  _ws_id uuid
)
returns table (
  user_id uuid,
  pending_count bigint,
  approved_count bigint,
  rejected_count bigint
)
language sql
stable
security definer
set search_path to public, private, pg_temp
as $$
  select
    r.user_id,
    count(*) filter (where r.report_approval_status = 'PENDING') as pending_count,
    count(*) filter (where r.report_approval_status = 'APPROVED') as approved_count,
    count(*) filter (where r.report_approval_status = 'REJECTED') as rejected_count
  from private.external_user_monthly_reports r
  join public.workspace_user_groups g on g.id = r.group_id
  where r.group_id = _group_id
    and g.ws_id = _ws_id
  group by r.user_id;
$$;

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
set search_path to public, audit, private
as $$
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
            'user_group_metric_categories',
            'user_group_metric_category_links',
            'user_indicators',
            'user_feedbacks',
            'workspace_course_modules',
            'workspace_course_module_groups'
          )
        )
        or (
          audit_log.table_schema = 'private'
          and audit_log.table_name in (
            'external_user_monthly_reports',
            'external_user_monthly_report_logs'
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
    left join public.user_group_metric_categories category_record
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
  order by resolved.occurred_at desc, resolved.audit_record_id desc;
$$;

alter function public.merge_workspace_users(uuid, uuid, uuid)
  set search_path to public, private, pg_temp;
alter function public.merge_workspace_users_phase1(uuid, uuid, uuid)
  set search_path to public, private, pg_temp;
alter function public.merge_workspace_users_phase1b(uuid, uuid, uuid)
  set search_path to public, private, pg_temp;
alter function public.merge_workspace_users_phase1b_batch(uuid, uuid, uuid, integer)
  set search_path to public, private, pg_temp;
alter function public.merge_workspace_users_batch_update(uuid, uuid, uuid, text, text, integer)
  set search_path to public, private, pg_temp;
alter function public.update_workspace_configs_with_approval_transitions(uuid, jsonb, uuid)
  set search_path to public, private, pg_temp;

notify pgrst, 'reload schema';
