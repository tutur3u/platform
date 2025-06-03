create extension if not exists "pg_trgm" with schema "extensions";


drop trigger if exists "delete_workspace_member_when_unlink" on "public"."workspace_user_linked_users";

drop policy "Allow users to read their own goals" on "public"."time_tracking_goals";

drop policy "Allow users to read their own sessions" on "public"."time_tracking_sessions";

drop policy "Enable delete for workspace owners" on "public"."workspaces";

alter table "public"."external_user_monthly_reports" drop constraint "external_user_monthly_reports_creator_id_fkey";

drop extension if exists "pg_trgm";

CREATE UNIQUE INDEX workspace_calendar_events_google_event_id_key ON public.workspace_calendar_events USING btree (google_event_id);

alter table "public"."workspace_calendar_events" add constraint "workspace_calendar_events_google_event_id_key" UNIQUE using index "workspace_calendar_events_google_event_id_key";

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

create policy "Allow users to read their own goals"
on "public"."time_tracking_goals"
as permissive
for select
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspace_members wu
  WHERE ((wu.ws_id = time_tracking_goals.ws_id) AND (wu.user_id = auth.uid())))));


create policy "Allow users to read their own sessions"
on "public"."time_tracking_sessions"
as permissive
for select
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspace_members wu
  WHERE ((wu.ws_id = time_tracking_sessions.ws_id) AND (wu.user_id = auth.uid())))));


create policy "Enable delete for workspace owners"
on "public"."workspaces"
as permissive
for delete
to authenticated
using (((id <> '00000000-0000-0000-0000-000000000000'::uuid) AND (id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid) AND (get_user_role(auth.uid(), id) = 'OWNER'::text)));


CREATE TRIGGER delete_workspace_member_when_unlink AFTER DELETE ON public.workspace_user_linked_users FOR EACH ROW EXECUTE FUNCTION delete_workspace_member_when_unlink();
ALTER TABLE "public"."workspace_user_linked_users" DISABLE TRIGGER "delete_workspace_member_when_unlink";


