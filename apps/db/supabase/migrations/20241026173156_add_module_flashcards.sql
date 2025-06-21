create table "public"."course_module_flashcards" (
    "module_id" uuid not null,
    "flashcard_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."course_module_flashcards" enable row level security;

CREATE UNIQUE INDEX course_module_flashcards_pkey ON public.course_module_flashcards USING btree (module_id, flashcard_id);

alter table "public"."course_module_flashcards" add constraint "course_module_flashcards_pkey" PRIMARY KEY using index "course_module_flashcards_pkey";

alter table "public"."course_module_flashcards" add constraint "course_module_flashcards_flashcard_id_fkey" FOREIGN KEY (flashcard_id) REFERENCES workspace_flashcards(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."course_module_flashcards" validate constraint "course_module_flashcards_flashcard_id_fkey";

alter table "public"."course_module_flashcards" add constraint "course_module_flashcards_module_id_fkey" FOREIGN KEY (module_id) REFERENCES workspace_course_modules(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."course_module_flashcards" validate constraint "course_module_flashcards_module_id_fkey";

grant delete on table "public"."course_module_flashcards" to "anon";

grant insert on table "public"."course_module_flashcards" to "anon";

grant references on table "public"."course_module_flashcards" to "anon";

grant select on table "public"."course_module_flashcards" to "anon";

grant trigger on table "public"."course_module_flashcards" to "anon";

grant truncate on table "public"."course_module_flashcards" to "anon";

grant update on table "public"."course_module_flashcards" to "anon";

grant delete on table "public"."course_module_flashcards" to "authenticated";

grant insert on table "public"."course_module_flashcards" to "authenticated";

grant references on table "public"."course_module_flashcards" to "authenticated";

grant select on table "public"."course_module_flashcards" to "authenticated";

grant trigger on table "public"."course_module_flashcards" to "authenticated";

grant truncate on table "public"."course_module_flashcards" to "authenticated";

grant update on table "public"."course_module_flashcards" to "authenticated";

grant delete on table "public"."course_module_flashcards" to "service_role";

grant insert on table "public"."course_module_flashcards" to "service_role";

grant references on table "public"."course_module_flashcards" to "service_role";

grant select on table "public"."course_module_flashcards" to "service_role";

grant trigger on table "public"."course_module_flashcards" to "service_role";

grant truncate on table "public"."course_module_flashcards" to "service_role";

grant update on table "public"."course_module_flashcards" to "service_role";

create policy "Allow all access for workspace member"
on "public"."course_module_flashcards"
as permissive
for all
to authenticated
using (((EXISTS ( SELECT 1
   FROM workspace_flashcards wf
  WHERE (wf.id = course_module_flashcards.flashcard_id))) AND (EXISTS ( SELECT 1
   FROM workspace_course_modules wcm
  WHERE (wcm.id = course_module_flashcards.module_id)))))
with check (((EXISTS ( SELECT 1
   FROM workspace_flashcards wf
  WHERE (wf.id = course_module_flashcards.flashcard_id))) AND (EXISTS ( SELECT 1
   FROM workspace_course_modules wcm
  WHERE (wcm.id = course_module_flashcards.module_id)))));



