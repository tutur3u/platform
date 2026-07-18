-- Keep the workspace-user listing RPC inlineable so PostgREST can push its
-- order, range, and exact-count operations into the query. The previous
-- PL/pgSQL implementation selected from workspace_users_with_groups and then
-- filtered on its aggregated linked_users JSON value. That forced PostgreSQL
-- to build group/link aggregates for every candidate before it could apply the
-- common virtual-user filter.
create or replace function public.get_workspace_users(
  _ws_id uuid,
  included_groups uuid[],
  excluded_groups uuid[],
  search_query text,
  include_archived boolean default false,
  link_status text default 'all',
  group_membership text default 'all'
)
returns table (
  id uuid,
  avatar_url text,
  full_name text,
  display_name text,
  email text,
  phone text,
  gender text,
  birthday date,
  ethnicity text,
  guardian text,
  address text,
  national_id text,
  note text,
  balance bigint,
  ws_id uuid,
  groups uuid[],
  group_count bigint,
  linked_users json,
  archived boolean,
  archived_until timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
as $$
  with search_parameters as (
    select
      public.normalize_workspace_user_search_text(search_query) as normalized_query,
      '%' || replace(
        public.normalize_workspace_user_search_text(search_query),
        ' ',
        '%'
      ) || '%' as normalized_pattern
  )
  select
    workspace_user.id,
    workspace_user.avatar_url,
    workspace_user.full_name,
    workspace_user.display_name,
    workspace_user.email,
    workspace_user.phone,
    workspace_user.gender,
    workspace_user.birthday,
    workspace_user.ethnicity,
    workspace_user.guardian,
    workspace_user.address,
    workspace_user.national_id,
    workspace_user.note,
    workspace_user.balance,
    workspace_user.ws_id,
    coalesce(group_details.groups, array[]::uuid[]) as groups,
    coalesce(group_details.group_count, 0)::bigint as group_count,
    link_details.linked_users,
    workspace_user.archived,
    workspace_user.archived_until,
    workspace_user.created_at,
    workspace_user.updated_at
  from public.workspace_users workspace_user
  cross join search_parameters
  left join lateral (
    select
      array_agg(group_user.group_id order by group_user.group_id) as groups,
      count(*)::bigint as group_count
    from public.workspace_user_groups_users group_user
    join public.workspace_user_groups user_group
      on user_group.id = group_user.group_id
      and user_group.ws_id = workspace_user.ws_id
    where group_user.user_id = workspace_user.id
  ) group_details on true
  left join lateral (
    select json_agg(linked_user order by linked_user.platform_user_id) as linked_users
    from (
      select distinct on (user_link.platform_user_id)
        user_link.platform_user_id,
        platform_user.display_name
      from public.workspace_user_linked_users user_link
      join public.users platform_user
        on platform_user.id = user_link.platform_user_id
      join public.workspace_members workspace_member
        on workspace_member.user_id = platform_user.id
        and workspace_member.ws_id = workspace_user.ws_id
      where user_link.ws_id = workspace_user.ws_id
        and user_link.virtual_user_id = workspace_user.id
      order by user_link.platform_user_id
    ) linked_user
  ) link_details on link_status <> 'virtual'
  where workspace_user.ws_id = _ws_id
    and (
      search_parameters.normalized_query = ''
      or public.normalize_workspace_user_search_text(
        coalesce(workspace_user.full_name, '') || ' ' ||
        coalesce(workspace_user.display_name, '') || ' ' ||
        coalesce(workspace_user.email, '') || ' ' ||
        coalesce(workspace_user.phone, '')
      ) like search_parameters.normalized_pattern
    )
    and (
      coalesce(cardinality(included_groups), 0) = 0
      or exists (
        select 1
        from public.workspace_user_groups_users included_group_user
        join public.workspace_user_groups included_group
          on included_group.id = included_group_user.group_id
          and included_group.ws_id = workspace_user.ws_id
        where included_group_user.user_id = workspace_user.id
          and included_group_user.group_id = any(included_groups)
      )
    )
    and (
      coalesce(cardinality(excluded_groups), 0) = 0
      or not exists (
        select 1
        from public.workspace_user_groups_users excluded_group_user
        join public.workspace_user_groups excluded_group
          on excluded_group.id = excluded_group_user.group_id
          and excluded_group.ws_id = workspace_user.ws_id
        where excluded_group_user.user_id = workspace_user.id
          and excluded_group_user.group_id = any(excluded_groups)
      )
    )
    and (include_archived or workspace_user.archived is not true)
    and (
      link_status = 'all'
      or (
        link_status = 'linked'
        and exists (
          select 1
          from public.workspace_user_linked_users linked_filter
          join public.workspace_members linked_member
            on linked_member.user_id = linked_filter.platform_user_id
            and linked_member.ws_id = workspace_user.ws_id
          where linked_filter.ws_id = workspace_user.ws_id
            and linked_filter.virtual_user_id = workspace_user.id
        )
      )
      or (
        link_status = 'virtual'
        and not exists (
          select 1
          from public.workspace_user_linked_users virtual_filter
          join public.workspace_members virtual_member
            on virtual_member.user_id = virtual_filter.platform_user_id
            and virtual_member.ws_id = workspace_user.ws_id
          where virtual_filter.ws_id = workspace_user.ws_id
            and virtual_filter.virtual_user_id = workspace_user.id
        )
      )
    )
    and (
      group_membership = 'all'
      or (
        group_membership = 'at-least-one'
        and coalesce(group_details.group_count, 0) > 0
      )
      or (
        group_membership = 'exactly-one'
        and coalesce(group_details.group_count, 0) = 1
      )
      or (
        group_membership = 'none'
        and coalesce(group_details.group_count, 0) = 0
      )
    );
$$;

comment on function public.get_workspace_users(
  uuid,
  uuid[],
  uuid[],
  text,
  boolean,
  text,
  text
) is
'Fetches workspace users with search, group, archive, link, and group-membership filters. Link and group filters run against indexed base tables before result aggregation, and the SQL function remains inlineable for PostgREST pagination and exact counts.';
