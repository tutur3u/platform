revoke delete on table "public"."quizzes" from "anon";

revoke insert on table "public"."quizzes" from "anon";

revoke references on table "public"."quizzes" from "anon";

revoke select on table "public"."quizzes" from "anon";

revoke trigger on table "public"."quizzes" from "anon";

revoke truncate on table "public"."quizzes" from "anon";

revoke update on table "public"."quizzes" from "anon";

revoke delete on table "public"."quizzes" from "authenticated";

revoke insert on table "public"."quizzes" from "authenticated";

revoke references on table "public"."quizzes" from "authenticated";

revoke select on table "public"."quizzes" from "authenticated";

revoke trigger on table "public"."quizzes" from "authenticated";

revoke truncate on table "public"."quizzes" from "authenticated";

revoke update on table "public"."quizzes" from "authenticated";

revoke delete on table "public"."quizzes" from "service_role";

revoke insert on table "public"."quizzes" from "service_role";

revoke references on table "public"."quizzes" from "service_role";

revoke select on table "public"."quizzes" from "service_role";

revoke trigger on table "public"."quizzes" from "service_role";

revoke truncate on table "public"."quizzes" from "service_role";

revoke update on table "public"."quizzes" from "service_role";

alter table "public"."quizzes" drop constraint "quizzes_pkey";

drop index if exists "public"."quizzes_pkey";

drop table "public"."quizzes";

alter table "public"."workspace_courses" add column "ws_id" uuid not null;

alter table "public"."workspace_flashcards" add column "ws_id" uuid not null;

alter table "public"."workspace_quizzes" add column "ws_id" uuid not null;

alter table "public"."workspace_courses" add constraint "workspace_courses_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_courses" validate constraint "workspace_courses_ws_id_fkey";

alter table "public"."workspace_flashcards" add constraint "workspace_flashcards_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_flashcards" validate constraint "workspace_flashcards_ws_id_fkey";

alter table "public"."workspace_quizzes" add constraint "workspace_quizzes_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_quizzes" validate constraint "workspace_quizzes_ws_id_fkey";

create policy "Allow all access for workspace member"
on "public"."workspace_courses"
as permissive
for all
to authenticated
using (is_org_member(auth.uid(), ws_id))
with check (is_org_member(auth.uid(), ws_id));


create policy "Allow all access for workspace member"
on "public"."workspace_flashcards"
as permissive
for all
to authenticated
using (is_org_member(auth.uid(), ws_id))
with check (is_org_member(auth.uid(), ws_id));


create policy "Allow all access for workspace member"
on "public"."workspace_quizzes"
as permissive
for all
to authenticated
using (is_org_member(auth.uid(), ws_id))
with check (is_org_member(auth.uid(), ws_id));



