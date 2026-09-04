-- Keep report discovery bounded and accent-insensitive for large workspaces.
-- These helpers are service-role only; the Contacts route performs workspace
-- permission checks before calling them.

create or replace function private.search_periodic_reports(
  p_ws_id uuid,
  p_cadence text,
  p_search text,
  p_group_ids uuid[] default null
)
returns setof private.external_user_monthly_reports_workspace_view
language sql
stable
security invoker
set search_path = ''
as $$
  with search_parameters as (
    select private.normalize_user_group_search_text(p_search) as normalized_query
  )
  select report.*
  from private.external_user_monthly_reports_workspace_view report
  cross join search_parameters
  where report.user_ws_id = p_ws_id
    and report.cadence = p_cadence
    and (p_group_ids is null or report.group_id = any(p_group_ids))
    and (
      search_parameters.normalized_query = ''
      or not exists (
        select 1
        from regexp_split_to_table(
          search_parameters.normalized_query,
          '\s+'
        ) as search_terms(term)
        where search_terms.term <> ''
          and private.normalize_user_group_search_text(
            concat_ws(
              ' ',
              report.title,
              report.user_full_name,
              report.user_display_name,
              report.user_email,
              report.group_name,
              report.creator_full_name,
              report.creator_display_name,
              report.creator_email
            )
          ) not like '%' || search_terms.term || '%'
      )
    );
$$;

create or replace function private.search_report_groups_for_selector(
  p_ws_id uuid,
  p_search text,
  p_accessible_group_ids uuid[] default null,
  p_limit integer default 21
)
returns table (
  id uuid,
  name text,
  pending_count bigint,
  approved_count bigint,
  rejected_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with search_parameters as (
    select private.normalize_user_group_search_text(p_search) as normalized_query
  ),
  matching_groups as materialized (
    select user_group.id, user_group.name
    from public.workspace_user_groups user_group
    cross join search_parameters
    where user_group.ws_id = p_ws_id
      and (
        p_accessible_group_ids is null
        or user_group.id = any(p_accessible_group_ids)
      )
      and (
        search_parameters.normalized_query = ''
        or not exists (
          select 1
          from regexp_split_to_table(
            search_parameters.normalized_query,
            '\s+'
          ) as search_terms(term)
          where search_terms.term <> ''
            and private.normalize_user_group_search_text(user_group.name)
              not like '%' || search_terms.term || '%'
            and not exists (
              select 1
              from public.workspace_user_groups_users membership
              join public.workspace_users member
                on member.id = membership.user_id
                and member.ws_id = p_ws_id
              where membership.group_id = user_group.id
                and private.normalize_user_group_search_text(
                  concat_ws(
                    ' ',
                    member.full_name,
                    member.display_name,
                    member.email,
                    member.phone
                  )
                ) like '%' || search_terms.term || '%'
            )
        )
      )
    order by
      (
        private.normalize_user_group_search_text(user_group.name)
        = search_parameters.normalized_query
      ) desc,
      (
        private.normalize_user_group_search_text(user_group.name)
        like search_parameters.normalized_query || '%'
      ) desc,
      user_group.name asc nulls last,
      user_group.id asc
    limit least(greatest(coalesce(p_limit, 21), 1), 51)
  )
  select
    matching_group.id,
    matching_group.name,
    count(report.id) filter (
      where report.report_approval_status = 'PENDING'
    ) as pending_count,
    count(report.id) filter (
      where report.report_approval_status = 'APPROVED'
    ) as approved_count,
    count(report.id) filter (
      where report.report_approval_status = 'REJECTED'
    ) as rejected_count
  from matching_groups matching_group
  left join private.external_user_monthly_reports report
    on report.group_id = matching_group.id
  group by matching_group.id, matching_group.name
  order by matching_group.name asc nulls last, matching_group.id asc;
$$;

create or replace function private.get_report_user_status_summary(
  p_ws_id uuid,
  p_group_id uuid,
  p_user_ids uuid[]
)
returns table (
  user_id uuid,
  pending_count bigint,
  approved_count bigint,
  rejected_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    report.user_id,
    count(*) filter (
      where report.report_approval_status = 'PENDING'
    ) as pending_count,
    count(*) filter (
      where report.report_approval_status = 'APPROVED'
    ) as approved_count,
    count(*) filter (
      where report.report_approval_status = 'REJECTED'
    ) as rejected_count
  from private.external_user_monthly_reports report
  join public.workspace_users report_user
    on report_user.id = report.user_id
    and report_user.ws_id = p_ws_id
  where report.group_id = p_group_id
    and report.user_id = any(coalesce(p_user_ids, array[]::uuid[]))
  group by report.user_id;
$$;

revoke all on function private.search_periodic_reports(uuid, text, text, uuid[])
from public, anon, authenticated;
revoke all on function private.search_report_groups_for_selector(
  uuid,
  text,
  uuid[],
  integer
) from public, anon, authenticated;
revoke all on function private.get_report_user_status_summary(
  uuid,
  uuid,
  uuid[]
) from public, anon, authenticated;

grant execute on function private.search_periodic_reports(
  uuid,
  text,
  text,
  uuid[]
) to service_role;
grant execute on function private.search_report_groups_for_selector(
  uuid,
  text,
  uuid[],
  integer
) to service_role;
grant execute on function private.get_report_user_status_summary(
  uuid,
  uuid,
  uuid[]
) to service_role;

comment on function private.search_periodic_reports(uuid, text, text, uuid[]) is
  'Service-only, accent-insensitive periodic report search across title, student, class, teacher, and email fields.';
comment on function private.search_report_groups_for_selector(
  uuid,
  text,
  uuid[],
  integer
) is
  'Service-only bounded report group search across class and member or teacher identity fields, with status counts for the returned groups only.';
comment on function private.get_report_user_status_summary(uuid, uuid, uuid[]) is
  'Service-only report status aggregation bounded to the visible user selector results.';
