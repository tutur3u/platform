create type "public"."ai_message_type" as enum ('message', 'file', 'summary', 'notes', 'multi_choice_quiz', 'paragraph_quiz', 'flashcards');

drop policy "Enable delete for organization members and current user" on "public"."workspace_email_invites";

drop policy "Enable read access for organization members and current user" on "public"."workspace_email_invites";

drop policy "Enable insert for invited members or workspace admins" on "public"."workspace_members";

drop policy "Enable read access for workspace users" on "public"."workspace_role_permissions";

drop policy "Enable read access for organization members or invited members" on "public"."workspaces";

revoke delete on table "public"."send_emails" from "anon";

revoke insert on table "public"."send_emails" from "anon";

revoke references on table "public"."send_emails" from "anon";

revoke select on table "public"."send_emails" from "anon";

revoke trigger on table "public"."send_emails" from "anon";

revoke truncate on table "public"."send_emails" from "anon";

revoke update on table "public"."send_emails" from "anon";

revoke delete on table "public"."send_emails" from "authenticated";

revoke insert on table "public"."send_emails" from "authenticated";

revoke references on table "public"."send_emails" from "authenticated";

revoke select on table "public"."send_emails" from "authenticated";

revoke trigger on table "public"."send_emails" from "authenticated";

revoke truncate on table "public"."send_emails" from "authenticated";

revoke update on table "public"."send_emails" from "authenticated";

revoke delete on table "public"."send_emails" from "service_role";

revoke insert on table "public"."send_emails" from "service_role";

revoke references on table "public"."send_emails" from "service_role";

revoke select on table "public"."send_emails" from "service_role";

revoke trigger on table "public"."send_emails" from "service_role";

revoke truncate on table "public"."send_emails" from "service_role";

revoke update on table "public"."send_emails" from "service_role";

revoke delete on table "public"."workspace_board_tasks" from "anon";

revoke insert on table "public"."workspace_board_tasks" from "anon";

revoke references on table "public"."workspace_board_tasks" from "anon";

revoke select on table "public"."workspace_board_tasks" from "anon";

revoke trigger on table "public"."workspace_board_tasks" from "anon";

revoke truncate on table "public"."workspace_board_tasks" from "anon";

revoke update on table "public"."workspace_board_tasks" from "anon";

revoke delete on table "public"."workspace_board_tasks" from "authenticated";

revoke insert on table "public"."workspace_board_tasks" from "authenticated";

revoke references on table "public"."workspace_board_tasks" from "authenticated";

revoke select on table "public"."workspace_board_tasks" from "authenticated";

revoke trigger on table "public"."workspace_board_tasks" from "authenticated";

revoke truncate on table "public"."workspace_board_tasks" from "authenticated";

revoke update on table "public"."workspace_board_tasks" from "authenticated";

revoke delete on table "public"."workspace_board_tasks" from "service_role";

revoke insert on table "public"."workspace_board_tasks" from "service_role";

revoke references on table "public"."workspace_board_tasks" from "service_role";

revoke select on table "public"."workspace_board_tasks" from "service_role";

revoke trigger on table "public"."workspace_board_tasks" from "service_role";

revoke truncate on table "public"."workspace_board_tasks" from "service_role";

revoke update on table "public"."workspace_board_tasks" from "service_role";

revoke delete on table "public"."workspace_boards_columns" from "anon";

revoke insert on table "public"."workspace_boards_columns" from "anon";

revoke references on table "public"."workspace_boards_columns" from "anon";

revoke select on table "public"."workspace_boards_columns" from "anon";

revoke trigger on table "public"."workspace_boards_columns" from "anon";

revoke truncate on table "public"."workspace_boards_columns" from "anon";

revoke update on table "public"."workspace_boards_columns" from "anon";

revoke delete on table "public"."workspace_boards_columns" from "authenticated";

revoke insert on table "public"."workspace_boards_columns" from "authenticated";

revoke references on table "public"."workspace_boards_columns" from "authenticated";

revoke select on table "public"."workspace_boards_columns" from "authenticated";

revoke trigger on table "public"."workspace_boards_columns" from "authenticated";

revoke truncate on table "public"."workspace_boards_columns" from "authenticated";

revoke update on table "public"."workspace_boards_columns" from "authenticated";

revoke delete on table "public"."workspace_boards_columns" from "service_role";

revoke insert on table "public"."workspace_boards_columns" from "service_role";

revoke references on table "public"."workspace_boards_columns" from "service_role";

revoke select on table "public"."workspace_boards_columns" from "service_role";

revoke trigger on table "public"."workspace_boards_columns" from "service_role";

revoke truncate on table "public"."workspace_boards_columns" from "service_role";

revoke update on table "public"."workspace_boards_columns" from "service_role";

alter table "public"."send_emails" drop constraint "send_emails_post_id_fkey";

alter table "public"."send_emails" drop constraint "send_emails_receiver_id_fkey";

alter table "public"."send_emails" drop constraint "send_emails_sender_id_fkey";

alter table "public"."workspace_board_tasks" drop constraint "workspace_board_tasks_columnId_fkey";

alter table "public"."workspace_boards_columns" drop constraint "workspace_boards_columns_boardId_fkey";

drop function if exists "public"."insert_ai_chat_message"(message text, chat_id uuid);

alter table "public"."send_emails" drop constraint "send_emails_pkey";

alter table "public"."workspace_board_tasks" drop constraint "workspace_board_tasks_pkey";

alter table "public"."workspace_boards_columns" drop constraint "workspace_boards_columns_pkey";

drop index if exists "public"."send_emails_pkey";

drop index if exists "public"."workspace_board_tasks_pkey";

drop index if exists "public"."workspace_boards_columns_pkey";

drop table "public"."send_emails";

drop table "public"."workspace_board_tasks";

drop table "public"."workspace_boards_columns";

alter type "public"."workspace_role_permission" rename to "workspace_role_permission__old_version_to_be_dropped";

create type "public"."workspace_role_permission" as enum ('view_infrastructure', 'manage_workspace_secrets', 'manage_external_migrations', 'manage_workspace_roles', 'manage_workspace_members', 'manage_workspace_settings', 'manage_workspace_integrations', 'manage_workspace_billing', 'manage_workspace_security', 'manage_workspace_audit_logs', 'manage_user_report_templates', 'manage_calendar', 'manage_projects', 'manage_documents', 'manage_drive', 'manage_users', 'export_users_data', 'manage_inventory', 'manage_finance', 'export_finance_data', 'ai_chat', 'ai_lab', 'send_user_group_post_emails');

create table "public"."quizzes" (
    "id" uuid not null default gen_random_uuid(),
    "name" text,
    "created_at" timestamp with time zone not null default now()
);


create table "public"."sent_emails" (
    "id" uuid not null default gen_random_uuid(),
    "sender_id" uuid not null,
    "receiver_id" uuid not null,
    "source_name" text not null,
    "source_email" text not null,
    "post_id" uuid,
    "email" text not null,
    "content" text not null,
    "created_at" timestamp with time zone not null default now(),
    "subject" text not null
);


alter table "public"."sent_emails" enable row level security;

alter table "public"."workspace_default_permissions" alter column permission type "public"."workspace_role_permission" using permission::text::"public"."workspace_role_permission";

alter table "public"."workspace_role_permissions" alter column permission type "public"."workspace_role_permission" using permission::text::"public"."workspace_role_permission";

drop type "public"."workspace_role_permission__old_version_to_be_dropped";

alter table "public"."ai_chat_messages" add column "metadata" jsonb;

alter table "public"."ai_chat_messages" add column "type" ai_message_type not null default 'message'::ai_message_type;

alter table "public"."ai_chats" add column "pinned" boolean not null default false;

alter table "public"."user_group_post_checks" add column "email_id" uuid;

alter table "public"."user_group_post_checks" enable row level security;

alter table "public"."workspace_email_invites" add column "invited_by" uuid;

CREATE UNIQUE INDEX quizzes_pkey ON public.quizzes USING btree (id);

CREATE UNIQUE INDEX sent_emails_pkey ON public.sent_emails USING btree (id);

CREATE UNIQUE INDEX user_group_post_checks_email_id_key ON public.user_group_post_checks USING btree (email_id);

alter table "public"."quizzes" add constraint "quizzes_pkey" PRIMARY KEY using index "quizzes_pkey";

alter table "public"."sent_emails" add constraint "sent_emails_pkey" PRIMARY KEY using index "sent_emails_pkey";

alter table "public"."sent_emails" add constraint "sent_emails_post_id_fkey" FOREIGN KEY (post_id) REFERENCES user_group_posts(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."sent_emails" validate constraint "sent_emails_post_id_fkey";

alter table "public"."sent_emails" add constraint "sent_emails_receiver_id_fkey" FOREIGN KEY (receiver_id) REFERENCES workspace_users(id) not valid;

alter table "public"."sent_emails" validate constraint "sent_emails_receiver_id_fkey";

alter table "public"."sent_emails" add constraint "sent_emails_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."sent_emails" validate constraint "sent_emails_sender_id_fkey";

alter table "public"."sent_emails" add constraint "sent_emails_sender_id_fkey1" FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."sent_emails" validate constraint "sent_emails_sender_id_fkey1";

alter table "public"."user_group_post_checks" add constraint "user_group_post_checks_email_id_fkey" FOREIGN KEY (email_id) REFERENCES sent_emails(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."user_group_post_checks" validate constraint "user_group_post_checks_email_id_fkey";

alter table "public"."user_group_post_checks" add constraint "user_group_post_checks_email_id_key" UNIQUE using index "user_group_post_checks_email_id_key";

alter table "public"."workspace_email_invites" add constraint "workspace_email_invites_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."workspace_email_invites" validate constraint "workspace_email_invites_invited_by_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_possible_excluded_tags(_ws_id uuid, included_tags uuid[])
 RETURNS TABLE(id uuid, name text, ws_id uuid, amount bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (wugt.id)
        wugt.id,
        wugt.name,
        wugt.ws_id,
        (SELECT COUNT(*)
         FROM workspace_user_group_tag_groups ugtg
         WHERE ugtg.tag_id = wugt.id AND ugtg.group_id IN (
            SELECT ugtg.group_id
            FROM workspace_user_group_tag_groups ugtg
            WHERE ugtg.tag_id = ANY(included_tags)
         )) AS amount
    FROM workspace_user_group_tags wugt
    JOIN workspace_user_group_tag_groups ugtg ON wugt.id = ugtg.tag_id
    WHERE wugt.ws_id = _ws_id AND ugtg.group_id IN (
        SELECT ugtg.group_id
        FROM workspace_user_group_tag_groups ugtg
        WHERE ugtg.tag_id = ANY(included_tags)
    ) AND NOT (wugt.id = ANY(included_tags));
END; $function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_user_groups(_ws_id uuid, included_tags uuid[], excluded_tags uuid[], search_query text)
 RETURNS TABLE(id uuid, name text, notes text, ws_id uuid, tags uuid[], tag_count bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        ug.id,
        ug.name,
        ug.notes,
        ug.ws_id,
        ARRAY(SELECT json_array_elements_text(ug.tags)::UUID) AS tags,
        ug.tag_count,
        ug.created_at
    FROM user_groups_with_tags ug
    WHERE ug.ws_id = _ws_id
    AND (search_query IS NULL OR (ug.name ILIKE '%' || search_query || '%'))
    AND ((included_tags IS NULL OR included_tags = ARRAY[]::uuid[] OR ARRAY(SELECT json_array_elements_text(ug.tags)::UUID) && included_tags) AND (excluded_tags IS NULL OR excluded_tags = ARRAY[]::uuid[] OR NOT (ARRAY(SELECT json_array_elements_text(ug.tags)::UUID) && excluded_tags)));
END; $function$
;

CREATE OR REPLACE FUNCTION public.insert_ai_chat_message(message text, chat_id uuid, source text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    INSERT INTO ai_chat_messages (chat_id, content, creator_id, role, metadata)
    VALUES (
        chat_id, 
        message, 
        auth.uid(), 
        'USER', 
        jsonb_build_object('source', COALESCE(source, 'Unknown'))
    );
END;
$function$
;

create or replace view "public"."user_groups_with_tags" as  SELECT wug.id,
    wug.ws_id,
    wug.name,
    wug.created_at,
    wug.archived,
    wug.ending_date,
    wug.notes,
    wug.sessions,
    wug.starting_date,
    ( SELECT json_agg(wugt.id) AS json_agg
           FROM (workspace_user_group_tags wugt
             JOIN workspace_user_group_tag_groups wugtg ON ((wugt.id = wugtg.tag_id)))
          WHERE (wugtg.group_id = wugt.id)) AS tags,
    ( SELECT count(*) AS count
           FROM (workspace_user_group_tags wugt
             JOIN workspace_user_group_tag_groups wugtg ON ((wugt.id = wugtg.tag_id)))
          WHERE (wugtg.group_id = wugt.id)) AS tag_count
   FROM workspace_user_groups wug;


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
  AND lower(i.email) = lower(auth.email());
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
        AND lower(wei.email) = lower(auth.email())
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
      AND lower(wei.email) = lower(auth.email())
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

grant delete on table "public"."quizzes" to "anon";

grant insert on table "public"."quizzes" to "anon";

grant references on table "public"."quizzes" to "anon";

grant select on table "public"."quizzes" to "anon";

grant trigger on table "public"."quizzes" to "anon";

grant truncate on table "public"."quizzes" to "anon";

grant update on table "public"."quizzes" to "anon";

grant delete on table "public"."quizzes" to "authenticated";

grant insert on table "public"."quizzes" to "authenticated";

grant references on table "public"."quizzes" to "authenticated";

grant select on table "public"."quizzes" to "authenticated";

grant trigger on table "public"."quizzes" to "authenticated";

grant truncate on table "public"."quizzes" to "authenticated";

grant update on table "public"."quizzes" to "authenticated";

grant delete on table "public"."quizzes" to "service_role";

grant insert on table "public"."quizzes" to "service_role";

grant references on table "public"."quizzes" to "service_role";

grant select on table "public"."quizzes" to "service_role";

grant trigger on table "public"."quizzes" to "service_role";

grant truncate on table "public"."quizzes" to "service_role";

grant update on table "public"."quizzes" to "service_role";

grant delete on table "public"."sent_emails" to "anon";

grant insert on table "public"."sent_emails" to "anon";

grant references on table "public"."sent_emails" to "anon";

grant select on table "public"."sent_emails" to "anon";

grant trigger on table "public"."sent_emails" to "anon";

grant truncate on table "public"."sent_emails" to "anon";

grant update on table "public"."sent_emails" to "anon";

grant delete on table "public"."sent_emails" to "authenticated";

grant insert on table "public"."sent_emails" to "authenticated";

grant references on table "public"."sent_emails" to "authenticated";

grant select on table "public"."sent_emails" to "authenticated";

grant trigger on table "public"."sent_emails" to "authenticated";

grant truncate on table "public"."sent_emails" to "authenticated";

grant update on table "public"."sent_emails" to "authenticated";

grant delete on table "public"."sent_emails" to "service_role";

grant insert on table "public"."sent_emails" to "service_role";

grant references on table "public"."sent_emails" to "service_role";

grant select on table "public"."sent_emails" to "service_role";

grant trigger on table "public"."sent_emails" to "service_role";

grant truncate on table "public"."sent_emails" to "service_role";

grant update on table "public"."sent_emails" to "service_role";

create policy "Enable all access for all users"
on "public"."sent_emails"
as permissive
for all
to authenticated
using (((post_id IS NULL) OR (EXISTS ( SELECT 1
   FROM user_group_posts ugp
  WHERE (ugp.id = sent_emails.post_id))) OR (EXISTS ( SELECT 1
   FROM workspace_users wu
  WHERE (wu.id = sent_emails.receiver_id)))))
with check (((post_id IS NULL) OR (EXISTS ( SELECT 1
   FROM user_group_posts ugp
  WHERE (ugp.id = sent_emails.post_id))) OR (EXISTS ( SELECT 1
   FROM workspace_users wu
  WHERE (wu.id = sent_emails.receiver_id)))));


create policy "Enable all access for workspace users"
on "public"."user_group_post_checks"
as permissive
for all
to authenticated
using (((EXISTS ( SELECT 1
   FROM workspace_users wu
  WHERE (wu.id = user_group_post_checks.user_id))) AND (EXISTS ( SELECT 1
   FROM user_group_posts ugp
  WHERE (ugp.id = user_group_post_checks.post_id)))));


create policy "Enable delete for organization members and current user"
on "public"."workspace_email_invites"
as permissive
for delete
to authenticated
using (((lower(auth.email()) = lower(email)) OR is_org_member(auth.uid(), ws_id)));


create policy "Enable read access for organization members and current user"
on "public"."workspace_email_invites"
as permissive
for select
to authenticated
using (((lower(auth.email()) = lower(email)) OR is_org_member(auth.uid(), ws_id)));


create policy "Enable insert for invited members or workspace admins"
on "public"."workspace_members"
as permissive
for insert
to authenticated
with check ((is_member_invited(auth.uid(), ws_id) OR (is_org_member(auth.uid(), ws_id) AND ((get_user_role(auth.uid(), ws_id) = 'ADMIN'::text) OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text))) OR (EXISTS ( SELECT 1
   FROM workspace_email_invites wei
  WHERE (lower(wei.email) = lower(auth.email()))))));


create policy "Enable read access for workspace users"
on "public"."workspace_role_permissions"
as permissive
for select
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspace_roles wr
  WHERE (wr.id = workspace_role_permissions.role_id))));


create policy "Enable read access for organization members or invited members"
on "public"."workspaces"
as permissive
for select
to authenticated
using ((is_org_member(auth.uid(), id) OR is_member_invited(auth.uid(), id) OR (EXISTS ( SELECT 1
   FROM workspace_email_invites wei
  WHERE ((lower(wei.email) = lower(auth.email())) AND (wei.ws_id = workspaces.id)))) OR (creator_id = auth.uid())));



