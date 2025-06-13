create table "public"."course_module_quizzes" (
    "module_id" uuid not null,
    "quiz_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."course_module_quizzes" enable row level security;

CREATE UNIQUE INDEX course_module_quizzes_pkey ON public.course_module_quizzes USING btree (module_id, quiz_id);

alter table "public"."course_module_quizzes" add constraint "course_module_quizzes_pkey" PRIMARY KEY using index "course_module_quizzes_pkey";

alter table "public"."course_module_quizzes" add constraint "course_module_quizzes_module_id_fkey" FOREIGN KEY (module_id) REFERENCES workspace_course_modules(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."course_module_quizzes" validate constraint "course_module_quizzes_module_id_fkey";

alter table "public"."course_module_quizzes" add constraint "course_module_quizzes_quiz_id_fkey" FOREIGN KEY (quiz_id) REFERENCES workspace_quizzes(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."course_module_quizzes" validate constraint "course_module_quizzes_quiz_id_fkey";

grant delete on table "public"."course_module_quizzes" to "anon";

grant insert on table "public"."course_module_quizzes" to "anon";

grant references on table "public"."course_module_quizzes" to "anon";

grant select on table "public"."course_module_quizzes" to "anon";

grant trigger on table "public"."course_module_quizzes" to "anon";

grant truncate on table "public"."course_module_quizzes" to "anon";

grant update on table "public"."course_module_quizzes" to "anon";

grant delete on table "public"."course_module_quizzes" to "authenticated";

grant insert on table "public"."course_module_quizzes" to "authenticated";

grant references on table "public"."course_module_quizzes" to "authenticated";

grant select on table "public"."course_module_quizzes" to "authenticated";

grant trigger on table "public"."course_module_quizzes" to "authenticated";

grant truncate on table "public"."course_module_quizzes" to "authenticated";

grant update on table "public"."course_module_quizzes" to "authenticated";

grant delete on table "public"."course_module_quizzes" to "service_role";

grant insert on table "public"."course_module_quizzes" to "service_role";

grant references on table "public"."course_module_quizzes" to "service_role";

grant select on table "public"."course_module_quizzes" to "service_role";

grant trigger on table "public"."course_module_quizzes" to "service_role";

grant truncate on table "public"."course_module_quizzes" to "service_role";

grant update on table "public"."course_module_quizzes" to "service_role";

create policy " Allow all access for workspace member"
on "public"."course_module_quizzes"
as permissive
for all
to authenticated
using (((EXISTS ( SELECT 1
   FROM workspace_quizzes wq
  WHERE (wq.id = course_module_quizzes.quiz_id))) AND (EXISTS ( SELECT 1
   FROM workspace_course_modules wcm
  WHERE (wcm.id = course_module_quizzes.module_id)))))
with check (((EXISTS ( SELECT 1
   FROM workspace_quizzes wq
  WHERE (wq.id = course_module_quizzes.quiz_id))) AND (EXISTS ( SELECT 1
   FROM workspace_course_modules wcm
  WHERE (wcm.id = course_module_quizzes.module_id)))));


create policy "Allow all access for workspace member"
on "public"."quiz_options"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspace_quizzes wq
  WHERE (wq.id = quiz_options.quiz_id))))
with check ((EXISTS ( SELECT 1
   FROM workspace_quizzes wq
  WHERE (wq.id = quiz_options.quiz_id))));



