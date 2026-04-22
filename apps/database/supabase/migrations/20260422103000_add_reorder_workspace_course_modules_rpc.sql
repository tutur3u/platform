create or replace function "public"."reorder_workspace_course_modules"(
  "p_group_id" uuid,
  "p_module_ids" uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update "public"."workspace_course_modules" as modules
  set "sort_key" = ordered.position
  from (
    select module_id, ordinality::integer as position
    from unnest("p_module_ids") with ordinality as ordered(module_id, ordinality)
  ) as ordered
  where modules.id = ordered.module_id
    and modules.group_id = "p_group_id";
end;
$$;

grant execute on function "public"."reorder_workspace_course_modules"(uuid, uuid[]) to service_role;
