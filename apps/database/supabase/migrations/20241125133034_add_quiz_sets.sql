create table "public"."course_module_quiz_sets" (
    "module_id" uuid not null,
    "set_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."course_module_quiz_sets" enable row level security;

create table "public"."quiz_set_quizzes" (
    "set_id" uuid not null,
    "quiz_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."quiz_set_quizzes" enable row level security;

create table "public"."workspace_quiz_sets" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null default ''::text,
    "ws_id" uuid,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."workspace_quiz_sets" enable row level security;

CREATE UNIQUE INDEX course_module_quiz_sets_pkey ON public.course_module_quiz_sets USING btree (module_id, set_id);

CREATE UNIQUE INDEX quiz_set_quizzes_pkey ON public.quiz_set_quizzes USING btree (set_id, quiz_id);

CREATE UNIQUE INDEX workspace_quiz_sets_pkey ON public.workspace_quiz_sets USING btree (id);

alter table "public"."course_module_quiz_sets" add constraint "course_module_quiz_sets_pkey" PRIMARY KEY using index "course_module_quiz_sets_pkey";

alter table "public"."quiz_set_quizzes" add constraint "quiz_set_quizzes_pkey" PRIMARY KEY using index "quiz_set_quizzes_pkey";

alter table "public"."workspace_quiz_sets" add constraint "workspace_quiz_sets_pkey" PRIMARY KEY using index "workspace_quiz_sets_pkey";

alter table "public"."course_module_quiz_sets" add constraint "course_module_quiz_sets_module_id_fkey" FOREIGN KEY (module_id) REFERENCES workspace_course_modules(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."course_module_quiz_sets" validate constraint "course_module_quiz_sets_module_id_fkey";

alter table "public"."course_module_quiz_sets" add constraint "course_module_quiz_sets_set_id_fkey" FOREIGN KEY (set_id) REFERENCES workspace_quiz_sets(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."course_module_quiz_sets" validate constraint "course_module_quiz_sets_set_id_fkey";

alter table "public"."quiz_set_quizzes" add constraint "quiz_set_quizzes_quiz_id_fkey" FOREIGN KEY (quiz_id) REFERENCES workspace_quizzes(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."quiz_set_quizzes" validate constraint "quiz_set_quizzes_quiz_id_fkey";

alter table "public"."quiz_set_quizzes" add constraint "quiz_set_quizzes_set_id_fkey" FOREIGN KEY (set_id) REFERENCES workspace_quiz_sets(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."quiz_set_quizzes" validate constraint "quiz_set_quizzes_set_id_fkey";

alter table "public"."workspace_quiz_sets" add constraint "workspace_quiz_sets_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_quiz_sets" validate constraint "workspace_quiz_sets_ws_id_fkey";

grant delete on table "public"."course_module_quiz_sets" to "anon";

grant insert on table "public"."course_module_quiz_sets" to "anon";

grant references on table "public"."course_module_quiz_sets" to "anon";

grant select on table "public"."course_module_quiz_sets" to "anon";

grant trigger on table "public"."course_module_quiz_sets" to "anon";

grant truncate on table "public"."course_module_quiz_sets" to "anon";

grant update on table "public"."course_module_quiz_sets" to "anon";

grant delete on table "public"."course_module_quiz_sets" to "authenticated";

grant insert on table "public"."course_module_quiz_sets" to "authenticated";

grant references on table "public"."course_module_quiz_sets" to "authenticated";

grant select on table "public"."course_module_quiz_sets" to "authenticated";

grant trigger on table "public"."course_module_quiz_sets" to "authenticated";

grant truncate on table "public"."course_module_quiz_sets" to "authenticated";

grant update on table "public"."course_module_quiz_sets" to "authenticated";

grant delete on table "public"."course_module_quiz_sets" to "service_role";

grant insert on table "public"."course_module_quiz_sets" to "service_role";

grant references on table "public"."course_module_quiz_sets" to "service_role";

grant select on table "public"."course_module_quiz_sets" to "service_role";

grant trigger on table "public"."course_module_quiz_sets" to "service_role";

grant truncate on table "public"."course_module_quiz_sets" to "service_role";

grant update on table "public"."course_module_quiz_sets" to "service_role";

grant delete on table "public"."quiz_set_quizzes" to "anon";

grant insert on table "public"."quiz_set_quizzes" to "anon";

grant references on table "public"."quiz_set_quizzes" to "anon";

grant select on table "public"."quiz_set_quizzes" to "anon";

grant trigger on table "public"."quiz_set_quizzes" to "anon";

grant truncate on table "public"."quiz_set_quizzes" to "anon";

grant update on table "public"."quiz_set_quizzes" to "anon";

grant delete on table "public"."quiz_set_quizzes" to "authenticated";

grant insert on table "public"."quiz_set_quizzes" to "authenticated";

grant references on table "public"."quiz_set_quizzes" to "authenticated";

grant select on table "public"."quiz_set_quizzes" to "authenticated";

grant trigger on table "public"."quiz_set_quizzes" to "authenticated";

grant truncate on table "public"."quiz_set_quizzes" to "authenticated";

grant update on table "public"."quiz_set_quizzes" to "authenticated";

grant delete on table "public"."quiz_set_quizzes" to "service_role";

grant insert on table "public"."quiz_set_quizzes" to "service_role";

grant references on table "public"."quiz_set_quizzes" to "service_role";

grant select on table "public"."quiz_set_quizzes" to "service_role";

grant trigger on table "public"."quiz_set_quizzes" to "service_role";

grant truncate on table "public"."quiz_set_quizzes" to "service_role";

grant update on table "public"."quiz_set_quizzes" to "service_role";

grant delete on table "public"."workspace_quiz_sets" to "anon";

grant insert on table "public"."workspace_quiz_sets" to "anon";

grant references on table "public"."workspace_quiz_sets" to "anon";

grant select on table "public"."workspace_quiz_sets" to "anon";

grant trigger on table "public"."workspace_quiz_sets" to "anon";

grant truncate on table "public"."workspace_quiz_sets" to "anon";

grant update on table "public"."workspace_quiz_sets" to "anon";

grant delete on table "public"."workspace_quiz_sets" to "authenticated";

grant insert on table "public"."workspace_quiz_sets" to "authenticated";

grant references on table "public"."workspace_quiz_sets" to "authenticated";

grant select on table "public"."workspace_quiz_sets" to "authenticated";

grant trigger on table "public"."workspace_quiz_sets" to "authenticated";

grant truncate on table "public"."workspace_quiz_sets" to "authenticated";

grant update on table "public"."workspace_quiz_sets" to "authenticated";

grant delete on table "public"."workspace_quiz_sets" to "service_role";

grant insert on table "public"."workspace_quiz_sets" to "service_role";

grant references on table "public"."workspace_quiz_sets" to "service_role";

grant select on table "public"."workspace_quiz_sets" to "service_role";

grant trigger on table "public"."workspace_quiz_sets" to "service_role";

grant truncate on table "public"."workspace_quiz_sets" to "service_role";

grant update on table "public"."workspace_quiz_sets" to "service_role";

create policy "Allow all access for workspace member"
on "public"."course_module_quiz_sets"
as permissive
for all
to authenticated
using (((EXISTS ( SELECT 1
   FROM workspace_quiz_sets wqs
  WHERE (wqs.id = course_module_quiz_sets.set_id))) AND (EXISTS ( SELECT 1
   FROM workspace_course_modules wcm
  WHERE (wcm.id = course_module_quiz_sets.module_id)))))
with check (((EXISTS ( SELECT 1
   FROM workspace_quiz_sets wqs
  WHERE (wqs.id = course_module_quiz_sets.set_id))) AND (EXISTS ( SELECT 1
   FROM workspace_course_modules wcm
  WHERE (wcm.id = course_module_quiz_sets.module_id)))));


create policy "Allow all access for workspace member"
on "public"."workspace_quiz_sets"
as permissive
for all
to authenticated
using (is_org_member(auth.uid(), ws_id))
with check (is_org_member(auth.uid(), ws_id));



