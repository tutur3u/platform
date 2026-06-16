alter table "public"."course_tests" add column "is_published" boolean not null default false;

create or replace function "public"."create_course_test_with_modules"(
    p_course_id uuid,
    p_name text,
    p_module_ids uuid[],
    p_start_at timestamp with time zone default null,
    p_duration_in_minutes integer default null,
    p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_test_id uuid;
begin
    if p_module_ids is null or cardinality(p_module_ids) = 0 then
        raise exception 'module_ids must not be empty' using errcode = '22023';
    end if;

    if exists (
        select 1
        from unnest(p_module_ids) as requested(module_id)
        left join workspace_course_modules wcm
            on wcm.id = requested.module_id
            and wcm.group_id = p_course_id
        where wcm.id is null
    ) then
        raise exception 'module_ids must belong to the course' using errcode = '23514';
    end if;

    insert into course_tests (
        course_id,
        name,
        start_at,
        duration_in_minutes,
        description
    )
    values (
        p_course_id,
        p_name,
        p_start_at,
        p_duration_in_minutes,
        p_description
    )
    returning id into v_test_id;

    insert into course_test_modules (test_id, module_id)
    select v_test_id, module_id
    from (
        select distinct module_id
        from unnest(p_module_ids) as requested(module_id)
    ) deduped_modules;

    return v_test_id;
end;
$$;

revoke all on function "public"."create_course_test_with_modules"(uuid, text, uuid[], timestamp with time zone, integer, text) from public, anon, authenticated;
grant execute on function "public"."create_course_test_with_modules"(uuid, text, uuid[], timestamp with time zone, integer, text) to service_role;
