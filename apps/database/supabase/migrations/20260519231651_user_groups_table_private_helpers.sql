create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function private.normalize_user_group_search_text(input text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(
    regexp_replace(
      replace(lower(extensions.unaccent(coalesce(input, ''))), 'đ', 'd'),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

create or replace function private.resolve_user_groups_table_timezone(p_ws_id uuid)
returns text
language plpgsql
stable
as $$
declare
  v_timezone text;
begin
  select nullif(trim(timezone), '')
  into v_timezone
  from public.workspaces
  where id = p_ws_id;

  if v_timezone is null or lower(v_timezone) = 'auto' then
    return 'UTC';
  end if;

  begin
    perform current_timestamp at time zone v_timezone;
    return v_timezone;
  exception when others then
    return 'UTC';
  end;
end;
$$;

create index if not exists workspace_user_groups_sessions_gin_idx
on public.workspace_user_groups
using gin (sessions);

create index if not exists workspace_user_groups_normalized_name_trgm_idx
on public.workspace_user_groups
using gin (private.normalize_user_group_search_text(name) gin_trgm_ops);

create or replace function private.list_workspace_user_groups_for_table(
  p_ws_id uuid,
  p_status text default 'active',
  p_search text default null,
  p_group_ids uuid[] default null,
  p_accessible_group_ids uuid[] default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  ws_id uuid,
  name text,
  starting_date timestamp with time zone,
  ending_date timestamp with time zone,
  archived boolean,
  notes text,
  is_guest boolean,
  amount integer,
  sessions date[],
  created_at timestamp with time zone,
  has_session_today boolean
)
language plpgsql
stable
as $$
declare
  v_status text := coalesce(nullif(trim(lower(p_status)), ''), 'active');
  v_search text := private.normalize_user_group_search_text(p_search);
  v_today date :=
    (current_timestamp at time zone private.resolve_user_groups_table_timezone(p_ws_id))::date;
begin
  return query
  select
    wug.id,
    wug.ws_id,
    wug.name,
    wug.starting_date,
    wug.ending_date,
    wug.archived,
    wug.notes,
    coalesce(wug.is_guest, false) as is_guest,
    count(wugu.*)::integer as amount,
    wug.sessions,
    wug.created_at,
    (coalesce(wug.sessions, '{}'::date[]) @> array[v_today]::date[]) as has_session_today
  from public.workspace_user_groups wug
  left join public.workspace_user_groups_users wugu
    on wugu.group_id = wug.id
  where wug.ws_id = p_ws_id
    and (
      v_status = 'all'
      or (v_status = 'active' and wug.archived = false)
      or (v_status = 'archived' and wug.archived = true)
    )
    and (p_group_ids is null or wug.id = any(p_group_ids))
    and (p_accessible_group_ids is null or wug.id = any(p_accessible_group_ids))
    and (
      v_search = ''
      or not exists (
        select 1
        from regexp_split_to_table(v_search, '\s+') as search_terms(term)
        where search_terms.term <> ''
          and private.normalize_user_group_search_text(wug.name)
            not like '%' || search_terms.term || '%'
      )
    )
  group by wug.id
  order by
    (coalesce(wug.sessions, '{}'::date[]) @> array[v_today]::date[]) desc,
    wug.name asc,
    wug.id asc
  limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function private.count_workspace_user_groups_for_table(
  p_ws_id uuid,
  p_status text default 'active',
  p_search text default null,
  p_group_ids uuid[] default null,
  p_accessible_group_ids uuid[] default null
)
returns integer
language plpgsql
stable
as $$
declare
  v_status text := coalesce(nullif(trim(lower(p_status)), ''), 'active');
  v_search text := private.normalize_user_group_search_text(p_search);
  v_count integer;
begin
  select count(*)::integer
  into v_count
  from public.workspace_user_groups wug
  where wug.ws_id = p_ws_id
    and (
      v_status = 'all'
      or (v_status = 'active' and wug.archived = false)
      or (v_status = 'archived' and wug.archived = true)
    )
    and (p_group_ids is null or wug.id = any(p_group_ids))
    and (p_accessible_group_ids is null or wug.id = any(p_accessible_group_ids))
    and (
      v_search = ''
      or not exists (
        select 1
        from regexp_split_to_table(v_search, '\s+') as search_terms(term)
        where search_terms.term <> ''
          and private.normalize_user_group_search_text(wug.name)
            not like '%' || search_terms.term || '%'
      )
    );

  return coalesce(v_count, 0);
end;
$$;

revoke all on function private.normalize_user_group_search_text(text)
from public, anon, authenticated;
revoke all on function private.resolve_user_groups_table_timezone(uuid)
from public, anon, authenticated;
revoke all on function private.list_workspace_user_groups_for_table(
  uuid,
  text,
  text,
  uuid[],
  uuid[],
  integer,
  integer
) from public, anon, authenticated;
revoke all on function private.count_workspace_user_groups_for_table(
  uuid,
  text,
  text,
  uuid[],
  uuid[]
) from public, anon, authenticated;

grant execute on function private.normalize_user_group_search_text(text)
to service_role;
grant execute on function private.resolve_user_groups_table_timezone(uuid)
to service_role;
grant execute on function private.list_workspace_user_groups_for_table(
  uuid,
  text,
  text,
  uuid[],
  uuid[],
  integer,
  integer
) to service_role;
grant execute on function private.count_workspace_user_groups_for_table(
  uuid,
  text,
  text,
  uuid[],
  uuid[]
) to service_role;

comment on function private.list_workspace_user_groups_for_table(
  uuid,
  text,
  text,
  uuid[],
  uuid[],
  integer,
  integer
) is
  'Server-only helper for the Tuturuuu API user groups table. Sorts groups with sessions today first using the workspace timezone and is intentionally not exposed through public Supabase REST.';

comment on function private.count_workspace_user_groups_for_table(
  uuid,
  text,
  text,
  uuid[],
  uuid[]
) is
  'Server-only count helper for the Tuturuuu API user groups table. Mirrors private.list_workspace_user_groups_for_table filters without exposing a public REST RPC.';
