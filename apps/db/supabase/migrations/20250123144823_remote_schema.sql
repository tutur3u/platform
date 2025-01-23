create schema if not exists "pgmq";

create extension if not exists "pgmq" with schema "pgmq" version '1.4.4';

create schema if not exists "pgmq_public";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION pgmq_public.archive(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ begin return pgmq.archive( queue_name := queue_name, msg_id := message_id ); end; $function$
;

CREATE OR REPLACE FUNCTION pgmq_public.delete(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ begin return pgmq.delete( queue_name := queue_name, msg_id := message_id ); end; $function$
;

CREATE OR REPLACE FUNCTION pgmq_public.pop(queue_name text)
 RETURNS SETOF pgmq.message_record
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ begin return query select * from pgmq.pop( queue_name := queue_name ); end; $function$
;

CREATE OR REPLACE FUNCTION pgmq_public.read(queue_name text, sleep_seconds integer, n integer)
 RETURNS SETOF pgmq.message_record
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ begin return query select * from pgmq.read( queue_name := queue_name, vt := sleep_seconds, qty := n ); end; $function$
;

CREATE OR REPLACE FUNCTION pgmq_public.send(queue_name text, message jsonb, sleep_seconds integer DEFAULT 0)
 RETURNS SETOF bigint
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ begin return query select * from pgmq.send( queue_name := queue_name, msg := message, delay := sleep_seconds ); end; $function$
;

CREATE OR REPLACE FUNCTION pgmq_public.send_batch(queue_name text, messages jsonb[], sleep_seconds integer DEFAULT 0)
 RETURNS SETOF bigint
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ begin return query select * from pgmq.send_batch( queue_name := queue_name, msgs := messages, delay := sleep_seconds ); end; $function$
;


drop trigger if exists "delete_workspace_member_when_unlink" on "public"."workspace_user_linked_users";

drop policy "Enable delete for workspace owners" on "public"."workspaces";

alter table "public"."external_user_monthly_reports" drop constraint "external_user_monthly_reports_creator_id_fkey";

alter table "public"."external_user_monthly_reports" add constraint "external_user_monthly_reports_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."external_user_monthly_reports" validate constraint "external_user_monthly_reports_creator_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_user_tasks(_board_id uuid)
 RETURNS TABLE(id uuid, name text, description text, priority smallint, completed boolean, start_date timestamp with time zone, end_date timestamp with time zone, list_id uuid, board_id uuid)
 LANGUAGE plpgsql
AS $function$
	begin
		return query
			select t.id, t.name, t.description, t.priority, t.completed, t.start_date, t.end_date, t.list_id, l.board_id
      from tasks t, task_lists l, task_assignees a
      where auth.uid() = a.user_id and
      l.board_id = _board_id and
      t.list_id = l.id and
      t.id = a.task_id and
      t.completed = false
      order by t.priority DESC, t.end_date ASC NULLS LAST;
	end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_list_accessible(_list_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM task_lists tl
  WHERE tl.id = _list_id
);
$function$
;

CREATE OR REPLACE FUNCTION public.is_task_accessible(_task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM tasks
  WHERE tasks.id = _task_id
);
$function$
;

create policy "Enable delete for workspace owners"
on "public"."workspaces"
as permissive
for delete
to authenticated
using (((id <> '00000000-0000-0000-0000-000000000000'::uuid) AND (id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid) AND (get_user_role(auth.uid(), id) = 'OWNER'::text)));


CREATE TRIGGER delete_workspace_member_when_unlink AFTER DELETE ON public.workspace_user_linked_users FOR EACH ROW EXECUTE FUNCTION delete_workspace_member_when_unlink();
ALTER TABLE "public"."workspace_user_linked_users" DISABLE TRIGGER "delete_workspace_member_when_unlink";


