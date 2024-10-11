drop policy "Enable all access for all users" on "public"."sent_emails";

drop policy "Enable all access for workspace users" on "public"."user_group_post_checks";

drop policy "Enable delete for organization members and current user" on "public"."workspace_email_invites";

drop policy "Enable read access for organization members and current user" on "public"."workspace_email_invites";

drop policy "Enable insert for invited members or workspace admins" on "public"."workspace_members";

drop policy "Enable read access for workspace users" on "public"."workspace_role_permissions";

drop policy "Enable read access for organization members or invited members" on "public"."workspaces";

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

revoke delete on table "public"."sent_emails" from "anon";

revoke insert on table "public"."sent_emails" from "anon";

revoke references on table "public"."sent_emails" from "anon";

revoke select on table "public"."sent_emails" from "anon";

revoke trigger on table "public"."sent_emails" from "anon";

revoke truncate on table "public"."sent_emails" from "anon";

revoke update on table "public"."sent_emails" from "anon";

revoke delete on table "public"."sent_emails" from "authenticated";

revoke insert on table "public"."sent_emails" from "authenticated";

revoke references on table "public"."sent_emails" from "authenticated";

revoke select on table "public"."sent_emails" from "authenticated";

revoke trigger on table "public"."sent_emails" from "authenticated";

revoke truncate on table "public"."sent_emails" from "authenticated";

revoke update on table "public"."sent_emails" from "authenticated";

revoke delete on table "public"."sent_emails" from "service_role";

revoke insert on table "public"."sent_emails" from "service_role";

revoke references on table "public"."sent_emails" from "service_role";

revoke select on table "public"."sent_emails" from "service_role";

revoke trigger on table "public"."sent_emails" from "service_role";

revoke truncate on table "public"."sent_emails" from "service_role";

revoke update on table "public"."sent_emails" from "service_role";

alter table "public"."sent_emails" drop constraint "sent_emails_post_id_fkey";

alter table "public"."sent_emails" drop constraint "sent_emails_receiver_id_fkey";

alter table "public"."sent_emails" drop constraint "sent_emails_sender_id_fkey";

alter table "public"."sent_emails" drop constraint "sent_emails_sender_id_fkey1";

alter table "public"."user_group_post_checks" drop constraint "user_group_post_checks_email_id_fkey";

alter table "public"."user_group_post_checks" drop constraint "user_group_post_checks_email_id_key";

drop function if exists "public"."get_possible_excluded_tags"(_ws_id uuid, included_tags uuid[]);

drop function if exists "public"."get_workspace_user_groups"(_ws_id uuid, included_tags uuid[], excluded_tags uuid[], search_query text);

drop function if exists "public"."insert_ai_chat_message"(message text, chat_id uuid, source text);

drop view if exists "public"."user_groups_with_tags";

alter table "public"."quizzes" drop constraint "quizzes_pkey";

alter table "public"."sent_emails" drop constraint "sent_emails_pkey";

drop index if exists "public"."quizzes_pkey";

drop index if exists "public"."sent_emails_pkey";

drop index if exists "public"."user_group_post_checks_email_id_key";

drop table "public"."quizzes";

drop table "public"."sent_emails";

alter type "public"."workspace_role_permission" rename to "workspace_role_permission__old_version_to_be_dropped";

create type "public"."workspace_role_permission" as enum ('view_infrastructure', 'manage_workspace_secrets', 'manage_external_migrations', 'manage_workspace_roles', 'manage_workspace_members', 'manage_workspace_settings', 'manage_workspace_integrations', 'manage_workspace_billing', 'manage_workspace_security', 'manage_workspace_audit_logs', 'manage_user_report_templates', 'manage_calendar', 'manage_projects', 'manage_documents', 'manage_drive', 'manage_users', 'manage_inventory', 'manage_finance', 'ai_chat', 'ai_lab');

create table "public"."send_emails" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "sender_id" uuid not null,
    "receiver_id" uuid not null,
    "content" text,
    "post_id" uuid,
    "email" text
);


alter table "public"."send_emails" enable row level security;

create table "public"."workspace_board_tasks" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone default now(),
    "content" text,
    "columnId" uuid default gen_random_uuid(),
    "position" bigint
);


create table "public"."workspace_boards_columns" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "boardId" uuid default gen_random_uuid(),
    "title" text,
    "potition" numeric
);


alter table "public"."workspace_default_permissions" alter column permission type "public"."workspace_role_permission" using permission::text::"public"."workspace_role_permission";

alter table "public"."workspace_role_permissions" alter column permission type "public"."workspace_role_permission" using permission::text::"public"."workspace_role_permission";

drop type "public"."workspace_role_permission__old_version_to_be_dropped";

alter table "public"."ai_chat_messages" drop column "metadata";

alter table "public"."ai_chat_messages" drop column "type";

alter table "public"."ai_chats" drop column "pinned";

alter table "public"."user_group_post_checks" drop column "email_id";

alter table "public"."user_group_post_checks" disable row level security;

drop type "public"."ai_message_type";

CREATE UNIQUE INDEX send_emails_pkey ON public.send_emails USING btree (id);

CREATE UNIQUE INDEX workspace_board_tasks_pkey ON public.workspace_board_tasks USING btree (id);

CREATE UNIQUE INDEX workspace_boards_columns_pkey ON public.workspace_boards_columns USING btree (id);

alter table "public"."send_emails" add constraint "send_emails_pkey" PRIMARY KEY using index "send_emails_pkey";

alter table "public"."workspace_board_tasks" add constraint "workspace_board_tasks_pkey" PRIMARY KEY using index "workspace_board_tasks_pkey";

alter table "public"."workspace_boards_columns" add constraint "workspace_boards_columns_pkey" PRIMARY KEY using index "workspace_boards_columns_pkey";

alter table "public"."send_emails" add constraint "send_emails_post_id_fkey" FOREIGN KEY (post_id) REFERENCES user_group_posts(id) not valid;

alter table "public"."send_emails" validate constraint "send_emails_post_id_fkey";

alter table "public"."send_emails" add constraint "send_emails_receiver_id_fkey" FOREIGN KEY (receiver_id) REFERENCES workspace_users(id) not valid;

alter table "public"."send_emails" validate constraint "send_emails_receiver_id_fkey";

alter table "public"."send_emails" add constraint "send_emails_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES workspace_users(id) not valid;

alter table "public"."send_emails" validate constraint "send_emails_sender_id_fkey";

alter table "public"."workspace_board_tasks" add constraint "workspace_board_tasks_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES workspace_boards_columns(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_board_tasks" validate constraint "workspace_board_tasks_columnId_fkey";

alter table "public"."workspace_boards_columns" add constraint "workspace_boards_columns_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES workspace_boards(id) not valid;

alter table "public"."workspace_boards_columns" validate constraint "workspace_boards_columns_boardId_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.insert_ai_chat_message(message text, chat_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ begin
insert into ai_chat_messages (chat_id, content, creator_id, role)
values (chat_id, message, auth.uid(), 'USER');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_invite_when_accepted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ begin -- Delete the invite
delete FROM public.workspace_invites i
WHERE i.ws_id = new.ws_id
  AND i.user_id = auth.uid();
delete FROM public.workspace_email_invites i
WHERE i.ws_id = new.ws_id
  AND i.email = auth.email();
return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_member_roles_from_invite()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ begin -- Copy role and role_title from invite to new member
  new.role := coalesce(
    (
      SELECT wei.role
      FROM public.workspace_email_invites wei
      WHERE wei.ws_id = new.ws_id
        AND wei.email = auth.email()
    ),(
      SELECT i.role
      FROM public.workspace_invites i
      WHERE i.ws_id = new.ws_id
        AND i.user_id = auth.uid()
    ),
    new.role,
    'MEMBER'::text
  );
new.role_title := coalesce(
  (
    SELECT wei.role_title
    FROM public.workspace_email_invites wei
    WHERE wei.ws_id = new.ws_id
      AND wei.email = auth.email()
  ),
  (
    SELECT i.role_title
    FROM public.workspace_invites i
    WHERE i.ws_id = new.ws_id
      AND i.user_id = auth.uid()
  ),
  new.role_title,
  ''::text
);
return new;
end;
$function$
;

grant delete on table "public"."send_emails" to "anon";

grant insert on table "public"."send_emails" to "anon";

grant references on table "public"."send_emails" to "anon";

grant select on table "public"."send_emails" to "anon";

grant trigger on table "public"."send_emails" to "anon";

grant truncate on table "public"."send_emails" to "anon";

grant update on table "public"."send_emails" to "anon";

grant delete on table "public"."send_emails" to "authenticated";

grant insert on table "public"."send_emails" to "authenticated";

grant references on table "public"."send_emails" to "authenticated";

grant select on table "public"."send_emails" to "authenticated";

grant trigger on table "public"."send_emails" to "authenticated";

grant truncate on table "public"."send_emails" to "authenticated";

grant update on table "public"."send_emails" to "authenticated";

grant delete on table "public"."send_emails" to "service_role";

grant insert on table "public"."send_emails" to "service_role";

grant references on table "public"."send_emails" to "service_role";

grant select on table "public"."send_emails" to "service_role";

grant trigger on table "public"."send_emails" to "service_role";

grant truncate on table "public"."send_emails" to "service_role";

grant update on table "public"."send_emails" to "service_role";

grant delete on table "public"."workspace_board_tasks" to "anon";

grant insert on table "public"."workspace_board_tasks" to "anon";

grant references on table "public"."workspace_board_tasks" to "anon";

grant select on table "public"."workspace_board_tasks" to "anon";

grant trigger on table "public"."workspace_board_tasks" to "anon";

grant truncate on table "public"."workspace_board_tasks" to "anon";

grant update on table "public"."workspace_board_tasks" to "anon";

grant delete on table "public"."workspace_board_tasks" to "authenticated";

grant insert on table "public"."workspace_board_tasks" to "authenticated";

grant references on table "public"."workspace_board_tasks" to "authenticated";

grant select on table "public"."workspace_board_tasks" to "authenticated";

grant trigger on table "public"."workspace_board_tasks" to "authenticated";

grant truncate on table "public"."workspace_board_tasks" to "authenticated";

grant update on table "public"."workspace_board_tasks" to "authenticated";

grant delete on table "public"."workspace_board_tasks" to "service_role";

grant insert on table "public"."workspace_board_tasks" to "service_role";

grant references on table "public"."workspace_board_tasks" to "service_role";

grant select on table "public"."workspace_board_tasks" to "service_role";

grant trigger on table "public"."workspace_board_tasks" to "service_role";

grant truncate on table "public"."workspace_board_tasks" to "service_role";

grant update on table "public"."workspace_board_tasks" to "service_role";

grant delete on table "public"."workspace_boards_columns" to "anon";

grant insert on table "public"."workspace_boards_columns" to "anon";

grant references on table "public"."workspace_boards_columns" to "anon";

grant select on table "public"."workspace_boards_columns" to "anon";

grant trigger on table "public"."workspace_boards_columns" to "anon";

grant truncate on table "public"."workspace_boards_columns" to "anon";

grant update on table "public"."workspace_boards_columns" to "anon";

grant delete on table "public"."workspace_boards_columns" to "authenticated";

grant insert on table "public"."workspace_boards_columns" to "authenticated";

grant references on table "public"."workspace_boards_columns" to "authenticated";

grant select on table "public"."workspace_boards_columns" to "authenticated";

grant trigger on table "public"."workspace_boards_columns" to "authenticated";

grant truncate on table "public"."workspace_boards_columns" to "authenticated";

grant update on table "public"."workspace_boards_columns" to "authenticated";

grant delete on table "public"."workspace_boards_columns" to "service_role";

grant insert on table "public"."workspace_boards_columns" to "service_role";

grant references on table "public"."workspace_boards_columns" to "service_role";

grant select on table "public"."workspace_boards_columns" to "service_role";

grant trigger on table "public"."workspace_boards_columns" to "service_role";

grant truncate on table "public"."workspace_boards_columns" to "service_role";

grant update on table "public"."workspace_boards_columns" to "service_role";

create policy "Enable delete for organization members and current user"
on "public"."workspace_email_invites"
as permissive
for delete
to authenticated
using (((auth.email() = email) OR is_org_member(auth.uid(), ws_id)));


create policy "Enable read access for organization members and current user"
on "public"."workspace_email_invites"
as permissive
for select
to authenticated
using (((auth.email() = email) OR is_org_member(auth.uid(), ws_id)));


create policy "Enable insert for invited members or workspace admins"
on "public"."workspace_members"
as permissive
for insert
to authenticated
with check ((is_member_invited(auth.uid(), ws_id) OR (is_org_member(auth.uid(), ws_id) AND ((get_user_role(auth.uid(), ws_id) = 'ADMIN'::text) OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text))) OR (EXISTS ( SELECT 1
   FROM workspace_email_invites wei
  WHERE (wei.email = auth.email())))));


create policy "Enable read access for workspace users"
on "public"."workspace_role_permissions"
as permissive
for select
to authenticated
using (is_org_member(auth.uid(), ws_id));


create policy "Enable read access for organization members or invited members"
on "public"."workspaces"
as permissive
for select
to authenticated
using ((is_org_member(auth.uid(), id) OR is_member_invited(auth.uid(), id) OR (EXISTS ( SELECT 1
   FROM workspace_email_invites wei
  WHERE (wei.email = auth.email()))) OR (creator_id = auth.uid())));



