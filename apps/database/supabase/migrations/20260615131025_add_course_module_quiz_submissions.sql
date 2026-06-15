create table "public"."course_module_quiz_submissions" (
    "id" uuid not null default gen_random_uuid(),
    "module_id" uuid not null,
    "quiz_id" uuid not null,
    "user_id" uuid not null default auth.uid(),
    "selected_option_id" uuid,
    "answer" jsonb,
    "is_correct" boolean not null,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."course_module_quiz_submissions" enable row level security;

CREATE UNIQUE INDEX course_module_quiz_submissions_pkey ON public.course_module_quiz_submissions USING btree (id);
alter table "public"."course_module_quiz_submissions" add constraint "course_module_quiz_submissions_pkey" PRIMARY KEY using index "course_module_quiz_submissions_pkey";

alter table "public"."course_module_quiz_submissions" add constraint "course_module_quiz_submissions_module_id_fkey" FOREIGN KEY (module_id) REFERENCES workspace_course_modules(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."course_module_quiz_submissions" validate constraint "course_module_quiz_submissions_module_id_fkey";

alter table "public"."course_module_quiz_submissions" add constraint "course_module_quiz_submissions_quiz_id_fkey" FOREIGN KEY (quiz_id) REFERENCES workspace_quizzes(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."course_module_quiz_submissions" validate constraint "course_module_quiz_submissions_quiz_id_fkey";

alter table "public"."course_module_quiz_submissions" add constraint "course_module_quiz_submissions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."course_module_quiz_submissions" validate constraint "course_module_quiz_submissions_user_id_fkey";

alter table "public"."course_module_quiz_submissions" add constraint "course_module_quiz_submissions_option_id_fkey" FOREIGN KEY (selected_option_id) REFERENCES quiz_options(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;
alter table "public"."course_module_quiz_submissions" validate constraint "course_module_quiz_submissions_option_id_fkey";

grant delete on table "public"."course_module_quiz_submissions" to "anon";
grant insert on table "public"."course_module_quiz_submissions" to "anon";
grant references on table "public"."course_module_quiz_submissions" to "anon";
grant select on table "public"."course_module_quiz_submissions" to "anon";
grant trigger on table "public"."course_module_quiz_submissions" to "anon";
grant truncate on table "public"."course_module_quiz_submissions" to "anon";
grant update on table "public"."course_module_quiz_submissions" to "anon";

grant delete on table "public"."course_module_quiz_submissions" to "authenticated";
grant insert on table "public"."course_module_quiz_submissions" to "authenticated";
grant references on table "public"."course_module_quiz_submissions" to "authenticated";
grant select on table "public"."course_module_quiz_submissions" to "authenticated";
grant trigger on table "public"."course_module_quiz_submissions" to "authenticated";
grant truncate on table "public"."course_module_quiz_submissions" to "authenticated";
grant update on table "public"."course_module_quiz_submissions" to "authenticated";

grant delete on table "public"."course_module_quiz_submissions" to "service_role";
grant insert on table "public"."course_module_quiz_submissions" to "service_role";
grant references on table "public"."course_module_quiz_submissions" to "service_role";
grant select on table "public"."course_module_quiz_submissions" to "service_role";
grant trigger on table "public"."course_module_quiz_submissions" to "service_role";
grant truncate on table "public"."course_module_quiz_submissions" to "service_role";
grant update on table "public"."course_module_quiz_submissions" to "service_role";

create policy "Enable users to view their own submissions only"
on "public"."course_module_quiz_submissions"
as permissive
for select
to authenticated
using ((auth.uid() = user_id));

create policy "Enable insert for users based on user_id"
on "public"."course_module_quiz_submissions"
as permissive
for insert
to authenticated
with check ((auth.uid() = user_id));
