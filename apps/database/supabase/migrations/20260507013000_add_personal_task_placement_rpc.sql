-- Centralize personal-board external task placement writes.
-- The RPC computes placement ordering against the combined personal list:
-- real personal-workspace tasks plus external task references.

create or replace function public.calculate_personal_task_placement_sort_key(
  p_user_id uuid,
  p_personal_board_id uuid,
  p_personal_list_id uuid,
  p_previous_task_id uuid default null,
  p_next_task_id uuid default null,
  p_requested_sort_key double precision default null
)
returns double precision
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_previous_sort_key double precision;
  v_next_sort_key double precision;
  v_max_sort_key double precision;
  v_base_unit constant double precision := 1000000;
  v_default_sort_key constant double precision := 1000000000;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and p_user_id is distinct from auth.uid()
  then
    raise exception 'Cannot calculate personal task placement for another user';
  end if;

  if p_personal_list_id is null then
    return null;
  end if;

  if p_previous_task_id is not null then
    select coalesce(tuo.personal_sort_key, t.sort_key::double precision)
    into v_previous_sort_key
    from public.tasks t
    left join public.task_user_overrides tuo
      on tuo.task_id = t.id
      and tuo.user_id = p_user_id
      and tuo.personal_board_id = p_personal_board_id
      and tuo.personal_list_id = p_personal_list_id
    where t.id = p_previous_task_id
      and t.deleted_at is null
      and (
        t.list_id = p_personal_list_id
        or tuo.personal_list_id = p_personal_list_id
      )
    limit 1;
  end if;

  if p_next_task_id is not null then
    select coalesce(tuo.personal_sort_key, t.sort_key::double precision)
    into v_next_sort_key
    from public.tasks t
    left join public.task_user_overrides tuo
      on tuo.task_id = t.id
      and tuo.user_id = p_user_id
      and tuo.personal_board_id = p_personal_board_id
      and tuo.personal_list_id = p_personal_list_id
    where t.id = p_next_task_id
      and t.deleted_at is null
      and (
        t.list_id = p_personal_list_id
        or tuo.personal_list_id = p_personal_list_id
      )
    limit 1;
  end if;

  if v_previous_sort_key is not null and v_next_sort_key is not null then
    if v_next_sort_key > v_previous_sort_key + 1 then
      return floor((v_previous_sort_key + v_next_sort_key) / 2);
    end if;

    if p_requested_sort_key is not null then
      return p_requested_sort_key;
    end if;

    return v_previous_sort_key + v_base_unit;
  end if;

  if v_previous_sort_key is not null then
    return v_previous_sort_key + v_base_unit;
  end if;

  if v_next_sort_key is not null then
    if v_next_sort_key > 1 then
      return greatest(1, floor(v_next_sort_key / 2));
    end if;

    if p_requested_sort_key is not null then
      return p_requested_sort_key;
    end if;
  end if;

  if p_requested_sort_key is not null then
    return p_requested_sort_key;
  end if;

  select max(effective_sort_key)
  into v_max_sort_key
  from (
    select t.sort_key::double precision as effective_sort_key
    from public.tasks t
    where t.list_id = p_personal_list_id
      and t.deleted_at is null
    union all
    select tuo.personal_sort_key as effective_sort_key
    from public.task_user_overrides tuo
    where tuo.user_id = p_user_id
      and tuo.personal_board_id = p_personal_board_id
      and tuo.personal_list_id = p_personal_list_id
      and tuo.personal_sort_key is not null
  ) ordered_tasks;

  return coalesce(v_max_sort_key + v_base_unit, v_default_sort_key + 1);
end;
$$;

revoke execute on function public.calculate_personal_task_placement_sort_key(
  uuid, uuid, uuid, uuid, uuid, double precision
) from public;

grant execute on function public.calculate_personal_task_placement_sort_key(
  uuid, uuid, uuid, uuid, uuid, double precision
) to authenticated, service_role;

create or replace function public.upsert_personal_task_placement(
  p_task_id uuid,
  p_user_id uuid,
  p_personal_board_id uuid,
  p_personal_list_id uuid default null,
  p_personal_sort_key double precision default null,
  p_previous_task_id uuid default null,
  p_next_task_id uuid default null
)
returns table (
  personal_board_id uuid,
  personal_list_id uuid,
  personal_sort_key double precision,
  personal_added_at timestamptz,
  personal_placed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_personal_added_at timestamptz;
  v_personal_sort_key double precision;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and p_user_id is distinct from auth.uid()
  then
    raise exception 'Cannot manage personal task placement for another user';
  end if;

  if not public.is_valid_personal_task_placement(
    p_user_id,
    p_personal_board_id,
    p_personal_list_id
  ) then
    raise exception 'Invalid personal task placement';
  end if;

  select tuo.personal_added_at
  into v_personal_added_at
  from public.task_user_overrides tuo
  where tuo.task_id = p_task_id
    and tuo.user_id = p_user_id;

  v_personal_added_at := coalesce(v_personal_added_at, v_now);
  v_personal_sort_key := public.calculate_personal_task_placement_sort_key(
    p_user_id,
    p_personal_board_id,
    p_personal_list_id,
    p_previous_task_id,
    p_next_task_id,
    p_personal_sort_key
  );

  return query
  insert into public.task_user_overrides (
    task_id,
    user_id,
    personal_board_id,
    personal_list_id,
    personal_sort_key,
    personal_added_at,
    personal_placed_at
  )
  values (
    p_task_id,
    p_user_id,
    p_personal_board_id,
    p_personal_list_id,
    case when p_personal_list_id is null then null else v_personal_sort_key end,
    v_personal_added_at,
    case when p_personal_list_id is null then null else v_now end
  )
  on conflict (task_id, user_id)
  do update set
    personal_board_id = excluded.personal_board_id,
    personal_list_id = excluded.personal_list_id,
    personal_sort_key = excluded.personal_sort_key,
    personal_added_at = coalesce(
      public.task_user_overrides.personal_added_at,
      excluded.personal_added_at
    ),
    personal_placed_at = excluded.personal_placed_at
  returning
    public.task_user_overrides.personal_board_id,
    public.task_user_overrides.personal_list_id,
    public.task_user_overrides.personal_sort_key,
    public.task_user_overrides.personal_added_at,
    public.task_user_overrides.personal_placed_at;
end;
$$;

revoke execute on function public.upsert_personal_task_placement(
  uuid, uuid, uuid, uuid, double precision, uuid, uuid
) from public;

grant execute on function public.upsert_personal_task_placement(
  uuid, uuid, uuid, uuid, double precision, uuid, uuid
) to authenticated, service_role;
