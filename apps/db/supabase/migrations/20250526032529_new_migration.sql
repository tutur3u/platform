create table "public"."course_module_completion_status" (
    "completion_id" uuid not null default gen_random_uuid(),
    "module_id" uuid not null default gen_random_uuid(),
    "user_id" uuid default auth.uid(),
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone default (now() AT TIME ZONE 'utc'::text),
    "completion_status" boolean not null default false
);


alter table "public"."course_module_completion_status" enable row level security;

CREATE UNIQUE INDEX course_module_completion_status_pkey ON public.course_module_completion_status USING btree (completion_id);

CREATE UNIQUE INDEX uq_user_module ON public.course_module_completion_status USING btree (user_id, module_id);

alter table "public"."course_module_completion_status" add constraint "course_module_completion_status_pkey" PRIMARY KEY using index "course_module_completion_status_pkey";

alter table "public"."course_module_completion_status" add constraint "course_module_completion_status_module_id_fkey" FOREIGN KEY (module_id) REFERENCES workspace_course_modules(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."course_module_completion_status" validate constraint "course_module_completion_status_module_id_fkey";

alter table "public"."course_module_completion_status" add constraint "course_module_completion_status_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."course_module_completion_status" validate constraint "course_module_completion_status_user_id_fkey";

alter table "public"."course_module_completion_status" add constraint "uq_user_module" UNIQUE using index "uq_user_module";

grant delete on table "public"."course_module_completion_status" to "anon";

grant insert on table "public"."course_module_completion_status" to "anon";

grant references on table "public"."course_module_completion_status" to "anon";

grant select on table "public"."course_module_completion_status" to "anon";

grant trigger on table "public"."course_module_completion_status" to "anon";

grant truncate on table "public"."course_module_completion_status" to "anon";

grant update on table "public"."course_module_completion_status" to "anon";

grant delete on table "public"."course_module_completion_status" to "authenticated";

grant insert on table "public"."course_module_completion_status" to "authenticated";

grant references on table "public"."course_module_completion_status" to "authenticated";

grant select on table "public"."course_module_completion_status" to "authenticated";

grant trigger on table "public"."course_module_completion_status" to "authenticated";

grant truncate on table "public"."course_module_completion_status" to "authenticated";

grant update on table "public"."course_module_completion_status" to "authenticated";

grant delete on table "public"."course_module_completion_status" to "service_role";

grant insert on table "public"."course_module_completion_status" to "service_role";

grant references on table "public"."course_module_completion_status" to "service_role";

grant select on table "public"."course_module_completion_status" to "service_role";

grant trigger on table "public"."course_module_completion_status" to "service_role";

grant truncate on table "public"."course_module_completion_status" to "service_role";

grant update on table "public"."course_module_completion_status" to "service_role";


