create or replace function private.admin_upsert_user_group_metric_categories_for_workspace(
  p_ws_id uuid,
  p_categories jsonb
)
returns integer
language plpgsql
security definer
set search_path = private, public
as $function$
declare
  input_count integer;
  upsert_count integer;
begin
  if p_ws_id is null then
    raise exception 'missing_workspace' using errcode = '22023';
  end if;

  if p_categories is null then
    return 0;
  end if;

  if jsonb_typeof(p_categories) <> 'array' then
    raise exception 'invalid_metric_category_payload' using errcode = '22023';
  end if;

  with raw_categories as (
    select value
    from jsonb_array_elements(p_categories) as categories(value)
  ),
  parsed_categories as (
    select
      nullif(value->>'id', '') as id_text,
      nullif(btrim(coalesce(value->>'name', '')), '') as name,
      case when value ? 'description' then value->>'description' else null end as description,
      case when value ? 'note' then value->>'note' else null end as note,
      case when value ? 'created_at' then nullif(value->>'created_at', '') else null end as created_at_text,
      value
    from raw_categories
  )
  select count(*)::integer
  into input_count
  from parsed_categories;

  if exists (
    with raw_categories as (
      select value
      from jsonb_array_elements(p_categories) as categories(value)
    ),
    parsed_categories as (
      select
        nullif(value->>'id', '') as id_text,
        nullif(btrim(coalesce(value->>'name', '')), '') as name,
        value
      from raw_categories
    )
    select 1
    from parsed_categories
    where jsonb_typeof(value) <> 'object'
      or id_text is null
      or id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or name is null
  ) then
    raise exception 'invalid_metric_category_payload' using errcode = '22023';
  end if;

  if exists (
    with raw_categories as (
      select value
      from jsonb_array_elements(p_categories) as categories(value)
    ),
    parsed_categories as (
      select lower(value->>'id') as id_text
      from raw_categories
    )
    select 1
    from parsed_categories
    group by id_text
    having count(*) > 1
  ) then
    raise exception 'duplicate_metric_category' using errcode = '22023';
  end if;

  with raw_categories as (
    select value
    from jsonb_array_elements(p_categories) as categories(value)
  ),
  input_categories as (
    select
      (value->>'id')::uuid as id,
      btrim(value->>'name') as name,
      case when value ? 'description' then value->>'description' else null end as description,
      case when value ? 'note' then value->>'note' else null end as note,
      case
        when value ? 'created_at' and nullif(value->>'created_at', '') is not null
          then (value->>'created_at')::timestamptz
        else null
      end as created_at
    from raw_categories
  ),
  upserted_categories as (
    insert into private.user_group_metric_categories as target (
      id,
      ws_id,
      name,
      description,
      note,
      created_at
    )
    select
      id,
      p_ws_id,
      name,
      description,
      note,
      coalesce(created_at, now())
    from input_categories
    on conflict (id) do update
    set
      name = excluded.name,
      description = excluded.description,
      note = excluded.note,
      created_at = coalesce(excluded.created_at, target.created_at)
    where target.ws_id = p_ws_id
    returning target.id
  )
  select count(*)::integer
  into upsert_count
  from upserted_categories;

  if upsert_count <> input_count then
    raise exception 'metric_category_not_found' using errcode = 'P0002';
  end if;

  return upsert_count;
end;
$function$;

revoke all on function private.admin_upsert_user_group_metric_categories_for_workspace(uuid, jsonb)
from public, anon, authenticated;

grant execute on function private.admin_upsert_user_group_metric_categories_for_workspace(uuid, jsonb)
to service_role;

notify pgrst, 'reload schema';
