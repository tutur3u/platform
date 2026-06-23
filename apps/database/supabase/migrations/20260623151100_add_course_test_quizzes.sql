create table "public"."course_test_quizzes" (
    "test_id" uuid not null,
    "module_id" uuid not null,
    "quiz_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."course_test_quizzes" enable row level security;

CREATE UNIQUE INDEX course_test_quizzes_pkey ON public.course_test_quizzes USING btree (test_id, module_id, quiz_id);
CREATE INDEX course_test_quizzes_test_id_module_id_idx ON public.course_test_quizzes USING btree (test_id, module_id);
CREATE INDEX course_test_quizzes_quiz_id_idx ON public.course_test_quizzes USING btree (quiz_id);

alter table "public"."course_test_quizzes" add constraint "course_test_quizzes_pkey" PRIMARY KEY using index "course_test_quizzes_pkey";

alter table "public"."course_test_quizzes" add constraint "course_test_quizzes_test_id_module_id_fkey" FOREIGN KEY (test_id, module_id) REFERENCES public.course_test_modules(test_id, module_id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."course_test_quizzes" validate constraint "course_test_quizzes_test_id_module_id_fkey";

alter table "public"."course_test_quizzes" add constraint "course_test_quizzes_quiz_id_fkey" FOREIGN KEY (quiz_id) REFERENCES public.workspace_quizzes(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."course_test_quizzes" validate constraint "course_test_quizzes_quiz_id_fkey";

-- Grants for course_test_quizzes
grant delete on table "public"."course_test_quizzes" to "anon";
grant insert on table "public"."course_test_quizzes" to "anon";
grant references on table "public"."course_test_quizzes" to "anon";
grant select on table "public"."course_test_quizzes" to "anon";
grant trigger on table "public"."course_test_quizzes" to "anon";
grant truncate on table "public"."course_test_quizzes" to "anon";
grant update on table "public"."course_test_quizzes" to "anon";

grant delete on table "public"."course_test_quizzes" to "authenticated";
grant insert on table "public"."course_test_quizzes" to "authenticated";
grant references on table "public"."course_test_quizzes" to "authenticated";
grant select on table "public"."course_test_quizzes" to "authenticated";
grant trigger on table "public"."course_test_quizzes" to "authenticated";
grant truncate on table "public"."course_test_quizzes" to "authenticated";
grant update on table "public"."course_test_quizzes" to "authenticated";

grant delete on table "public"."course_test_quizzes" to "service_role";
grant insert on table "public"."course_test_quizzes" to "service_role";
grant references on table "public"."course_test_quizzes" to "service_role";
grant select on table "public"."course_test_quizzes" to "service_role";
grant trigger on table "public"."course_test_quizzes" to "service_role";
grant truncate on table "public"."course_test_quizzes" to "service_role";
grant update on table "public"."course_test_quizzes" to "service_role";

-- RLS Policies
create policy "Allow all access for workspace member"
on "public"."course_test_quizzes"
as permissive
for all
to authenticated
using (
  (exists (select 1 from workspace_quizzes wq where wq.id = course_test_quizzes.quiz_id)) AND
  (exists (select 1 from course_test_modules ctm where ctm.test_id = course_test_quizzes.test_id and ctm.module_id = course_test_quizzes.module_id))
)
with check (
  (exists (select 1 from workspace_quizzes wq where wq.id = course_test_quizzes.quiz_id)) AND
  (exists (select 1 from course_test_modules ctm where ctm.test_id = course_test_quizzes.test_id and ctm.module_id = course_test_quizzes.module_id))
);
