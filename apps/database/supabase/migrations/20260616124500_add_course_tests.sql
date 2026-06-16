create table "public"."course_tests" (
    "id" uuid not null default gen_random_uuid(),
    "course_id" uuid not null,
    "name" text not null default ''::text,
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

alter table "public"."course_tests" add constraint "course_tests_pkey" PRIMARY KEY using index "course_tests_pkey";
alter table "public"."course_test_modules" add constraint "course_test_modules_pkey" PRIMARY KEY using index "course_test_modules_pkey";

alter table "public"."course_tests" add constraint "course_tests_course_id_fkey" FOREIGN KEY (course_id) REFERENCES workspace_user_groups(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."course_tests" validate constraint "course_tests_course_id_fkey";

alter table "public"."course_test_modules" add constraint "course_test_modules_test_id_fkey" FOREIGN KEY (test_id) REFERENCES course_tests(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."course_test_modules" validate constraint "course_test_modules_test_id_fkey";

alter table "public"."course_test_modules" add constraint "course_test_modules_module_id_fkey" FOREIGN KEY (module_id) REFERENCES workspace_course_modules(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."course_test_modules" validate constraint "course_test_modules_module_id_fkey";

-- Grants for course_tests
grant delete on table "public"."course_tests" to "anon";
grant insert on table "public"."course_tests" to "anon";
grant references on table "public"."course_tests" to "anon";
grant select on table "public"."course_tests" to "anon";
grant trigger on table "public"."course_tests" to "anon";
grant truncate on table "public"."course_tests" to "anon";
grant update on table "public"."course_tests" to "anon";

grant delete on table "public"."course_tests" to "authenticated";
grant insert on table "public"."course_tests" to "authenticated";
grant references on table "public"."course_tests" to "authenticated";
grant select on table "public"."course_tests" to "authenticated";
grant trigger on table "public"."course_tests" to "authenticated";
grant truncate on table "public"."course_tests" to "authenticated";
grant update on table "public"."course_tests" to "authenticated";

grant delete on table "public"."course_tests" to "service_role";
grant insert on table "public"."course_tests" to "service_role";
grant references on table "public"."course_tests" to "service_role";
grant select on table "public"."course_tests" to "service_role";
grant trigger on table "public"."course_tests" to "service_role";
grant truncate on table "public"."course_tests" to "service_role";
grant update on table "public"."course_tests" to "service_role";

-- Grants for course_test_modules
grant delete on table "public"."course_test_modules" to "anon";
grant insert on table "public"."course_test_modules" to "anon";
grant references on table "public"."course_test_modules" to "anon";
grant select on table "public"."course_test_modules" to "anon";
grant trigger on table "public"."course_test_modules" to "anon";
grant truncate on table "public"."course_test_modules" to "anon";
grant update on table "public"."course_test_modules" to "anon";

grant delete on table "public"."course_test_modules" to "authenticated";
grant insert on table "public"."course_test_modules" to "authenticated";
grant references on table "public"."course_test_modules" to "authenticated";
grant select on table "public"."course_test_modules" to "authenticated";
grant trigger on table "public"."course_test_modules" to "authenticated";
grant truncate on table "public"."course_test_modules" to "authenticated";
grant update on table "public"."course_test_modules" to "authenticated";

grant delete on table "public"."course_test_modules" to "service_role";
grant insert on table "public"."course_test_modules" to "service_role";
grant references on table "public"."course_test_modules" to "service_role";
grant select on table "public"."course_test_modules" to "service_role";
grant trigger on table "public"."course_test_modules" to "service_role";
grant truncate on table "public"."course_test_modules" to "service_role";
grant update on table "public"."course_test_modules" to "service_role";

-- RLS Policies
create policy "Allow all access for workspace member"
on "public"."course_tests"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspace_user_groups wug
  WHERE ((wug.id = course_tests.course_id) AND (is_org_member(auth.uid(), wug.ws_id))))))
with check ((EXISTS ( SELECT 1
   FROM workspace_user_groups wug
  WHERE ((wug.id = course_tests.course_id) AND (is_org_member(auth.uid(), wug.ws_id))))));

create policy "Allow all access for workspace member"
on "public"."course_test_modules"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM course_tests ct
  WHERE (ct.id = course_test_modules.test_id))))
with check ((EXISTS ( SELECT 1
   FROM course_tests ct
  WHERE (ct.id = course_test_modules.test_id))));
