create table "public"."course_tests" (
    "id" uuid not null default gen_random_uuid(),
    "course_id" uuid not null,
    "name" text not null,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."course_tests" enable row level security;

create table "public"."course_test_modules" (
    "test_id" uuid not null,
    "module_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."course_test_modules" enable row level security;

CREATE UNIQUE INDEX course_tests_pkey ON public.course_tests USING btree (id);
CREATE UNIQUE INDEX course_test_modules_pkey ON public.course_test_modules USING btree (test_id, module_id);
CREATE INDEX course_tests_course_id_created_at_idx ON public.course_tests USING btree (course_id, created_at DESC);
CREATE INDEX course_test_modules_module_id_idx ON public.course_test_modules USING btree (module_id);

alter table "public"."course_tests" add constraint "course_tests_pkey" PRIMARY KEY using index "course_tests_pkey";
alter table "public"."course_test_modules" add constraint "course_test_modules_pkey" PRIMARY KEY using index "course_test_modules_pkey";

alter table "public"."course_tests" add constraint "course_tests_course_id_fkey" FOREIGN KEY (course_id) REFERENCES workspace_user_groups(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."course_tests" validate constraint "course_tests_course_id_fkey";

alter table "public"."course_test_modules" add constraint "course_test_modules_test_id_fkey" FOREIGN KEY (test_id) REFERENCES course_tests(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."course_test_modules" validate constraint "course_test_modules_test_id_fkey";

alter table "public"."course_test_modules" add constraint "course_test_modules_module_id_fkey" FOREIGN KEY (module_id) REFERENCES workspace_course_modules(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."course_test_modules" validate constraint "course_test_modules_module_id_fkey";

-- Grants for course_tests
grant select on table "public"."course_tests" to "authenticated";

grant delete on table "public"."course_tests" to "service_role";
grant insert on table "public"."course_tests" to "service_role";
grant references on table "public"."course_tests" to "service_role";
grant select on table "public"."course_tests" to "service_role";
grant trigger on table "public"."course_tests" to "service_role";
grant truncate on table "public"."course_tests" to "service_role";
grant update on table "public"."course_tests" to "service_role";

-- Grants for course_test_modules
grant select on table "public"."course_test_modules" to "authenticated";

grant delete on table "public"."course_test_modules" to "service_role";
grant insert on table "public"."course_test_modules" to "service_role";
grant references on table "public"."course_test_modules" to "service_role";
grant select on table "public"."course_test_modules" to "service_role";
grant trigger on table "public"."course_test_modules" to "service_role";
grant truncate on table "public"."course_test_modules" to "service_role";
grant update on table "public"."course_test_modules" to "service_role";

-- RLS Policies
create policy course_tests_select_workspace_member
on "public"."course_tests"
as permissive
for select
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspace_user_groups wug
  WHERE ((wug.id = course_tests.course_id) AND (is_org_member(auth.uid(), wug.ws_id))))));

create policy course_test_modules_select_workspace_member
on "public"."course_test_modules"
as permissive
for select
to authenticated
using ((EXISTS ( SELECT 1
   FROM course_tests ct
     JOIN workspace_user_groups wug ON (wug.id = ct.course_id)
     JOIN workspace_course_modules wcm ON ((wcm.id = course_test_modules.module_id) AND (wcm.group_id = ct.course_id))
  WHERE ((ct.id = course_test_modules.test_id) AND (is_org_member(auth.uid(), wug.ws_id))))));

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
