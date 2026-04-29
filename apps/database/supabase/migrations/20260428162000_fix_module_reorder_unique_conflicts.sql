-- Avoid transient unique-key collisions when reordering module groups/modules.
-- Unique indexes on (group_id, sort_key) and (module_group_id, sort_key) are
-- immediate, so direct swaps (1 <-> 2) can fail unless we stage via safe keys.

create or replace function "public"."reorder_workspace_course_module_groups"(
  "p_group_id" uuid,
  "p_module_group_ids" uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_temp_offset integer;
begin
  perform pg_advisory_xact_lock(hashtextextended("p_group_id"::text, 0));

  select
    coalesce(max(module_groups."sort_key"), 0)
    + coalesce(array_length("p_module_group_ids", 1), 0)
    + 1
  into v_temp_offset
  from "public"."workspace_course_module_groups" module_groups
  where module_groups."group_id" = "p_group_id";

  -- Phase 1: move target rows outside current keyspace.
  with ordered as (
    select module_group_id, ordinality::integer as position
    from unnest("p_module_group_ids") with ordinality as ordered(module_group_id, ordinality)
  )
  update "public"."workspace_course_module_groups" as module_groups
  set "sort_key" = v_temp_offset + ordered.position
  from ordered
  where module_groups."id" = ordered.module_group_id
    and module_groups."group_id" = "p_group_id";

  -- Phase 2: write final normalized order.
  with ordered as (
    select module_group_id, ordinality::integer as position
    from unnest("p_module_group_ids") with ordinality as ordered(module_group_id, ordinality)
  )
  update "public"."workspace_course_module_groups" as module_groups
  set "sort_key" = ordered.position
  from ordered
  where module_groups."id" = ordered.module_group_id
    and module_groups."group_id" = "p_group_id";
end;
$$;

create or replace function "public"."reorder_workspace_course_modules_in_module_group"(
  "p_module_group_id" uuid,
  "p_module_ids" uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_temp_offset integer;
begin
  perform pg_advisory_xact_lock(hashtextextended("p_module_group_id"::text, 0));

  select
    coalesce(max(modules."sort_key"), 0)
    + coalesce(array_length("p_module_ids", 1), 0)
    + 1
  into v_temp_offset
  from "public"."workspace_course_modules" modules
  where modules."module_group_id" = "p_module_group_id";

  -- Phase 1: move target rows outside current keyspace.
  with ordered as (
    select module_id, ordinality::integer as position
    from unnest("p_module_ids") with ordinality as ordered(module_id, ordinality)
  )
  update "public"."workspace_course_modules" as modules
  set "sort_key" = v_temp_offset + ordered.position
  from ordered
  where modules."id" = ordered.module_id
    and modules."module_group_id" = "p_module_group_id";

  -- Phase 2: write final normalized order.
  with ordered as (
    select module_id, ordinality::integer as position
    from unnest("p_module_ids") with ordinality as ordered(module_id, ordinality)
  )
  update "public"."workspace_course_modules" as modules
  set "sort_key" = ordered.position
  from ordered
  where modules."id" = ordered.module_id
    and modules."module_group_id" = "p_module_group_id";
end;
$$;

create or replace function "public"."reorder_workspace_course_modules"(
  "p_group_id" uuid,
  "p_module_ids" uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended("p_group_id"::text, 0));

  with ordered as (
    select module_id, ordinality::integer as position
    from unnest("p_module_ids") with ordinality as ordered(module_id, ordinality)
  ),
  ordered_with_groups as (
    select
      ordered.module_id,
      modules."module_group_id",
      row_number() over (
        partition by modules."module_group_id"
        order by ordered.position
      )::integer as position_in_module_group
    from ordered
    inner join "public"."workspace_course_modules" modules
      on modules."id" = ordered.module_id
    where modules."group_id" = "p_group_id"
  ),
  offsets as (
    select
      grouped.module_group_id,
      coalesce(max(grouped."sort_key"), 0)
      + coalesce(max(grouped.position_in_module_group), 0)
      + 1 as temp_offset
    from (
      select
        modules."module_group_id",
        modules."sort_key",
        ordered_with_groups.position_in_module_group
      from "public"."workspace_course_modules" modules
      left join ordered_with_groups
        on ordered_with_groups.module_group_id = modules."module_group_id"
      where modules."group_id" = "p_group_id"
    ) as grouped
    group by grouped.module_group_id
  )
  update "public"."workspace_course_modules" as modules
  set "sort_key" = offsets.temp_offset + ordered_with_groups.position_in_module_group
  from ordered_with_groups
  inner join offsets
    on offsets.module_group_id = ordered_with_groups.module_group_id
  where modules."id" = ordered_with_groups.module_id
    and modules."module_group_id" = ordered_with_groups."module_group_id";

  with ordered as (
    select module_id, ordinality::integer as position
    from unnest("p_module_ids") with ordinality as ordered(module_id, ordinality)
  ),
  ordered_with_groups as (
    select
      ordered.module_id,
      modules."module_group_id",
      row_number() over (
        partition by modules."module_group_id"
        order by ordered.position
      )::integer as position_in_module_group
    from ordered
    inner join "public"."workspace_course_modules" modules
      on modules."id" = ordered.module_id
    where modules."group_id" = "p_group_id"
  )
  update "public"."workspace_course_modules" as modules
  set "sort_key" = ordered_with_groups.position_in_module_group
  from ordered_with_groups
  where modules."id" = ordered_with_groups.module_id
    and modules."module_group_id" = ordered_with_groups."module_group_id";
end;
$$;
