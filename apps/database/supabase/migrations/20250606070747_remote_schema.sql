create extension if not exists "pg_trgm" with schema "extensions";

drop trigger if exists "delete_workspace_member_when_unlink" on "public"."workspace_user_linked_users";

drop policy "Allow users to read their own goals" on "public"."time_tracking_goals";

drop policy "Allow users to read their own sessions" on "public"."time_tracking_sessions";

drop policy "Enable delete for workspace owners" on "public"."workspaces";

alter table "public"."external_user_monthly_reports" drop constraint "external_user_monthly_reports_creator_id_fkey";

drop view if exists "public"."meet_together_users";

drop view if exists "public"."workspace_members_and_invites";

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

create or replace view "public"."meet_together_users" as  SELECT DISTINCT ON (all_users.id, COALESCE(gtbs.plan_id, utbs.plan_id)) all_users.id AS user_id,
    COALESCE(NULLIF(all_users.name, ''::text), upd.email) AS display_name,
    COALESCE(gtbs.plan_id, utbs.plan_id) AS plan_id,
        CASE
            WHEN all_users.is_guest THEN true
            ELSE false
        END AS is_guest,
    count(COALESCE(gtbs.id, utbs.id)) AS timeblock_count
   FROM ((((( SELECT meet_together_guests.id,
            meet_together_guests.name,
            true AS is_guest
           FROM meet_together_guests
        UNION ALL
         SELECT u.id,
            u.display_name AS name,
            false AS is_guest
           FROM users u) all_users
     LEFT JOIN user_private_details upd ON ((all_users.id = upd.user_id)))
     LEFT JOIN meet_together_guest_timeblocks gtbs ON (((all_users.id = gtbs.user_id) AND all_users.is_guest)))
     LEFT JOIN meet_together_user_timeblocks utbs ON (((all_users.id = utbs.user_id) AND (NOT all_users.is_guest))))
     LEFT JOIN meet_together_plans plans ON ((plans.id = COALESCE(gtbs.plan_id, utbs.plan_id))))
  WHERE (COALESCE(gtbs.plan_id, utbs.plan_id) IS NOT NULL)
  GROUP BY all_users.id, all_users.name, upd.email, all_users.is_guest, gtbs.plan_id, utbs.plan_id;


create or replace view "public"."workspace_members_and_invites" as  SELECT wi.ws_id,
    u.id,
    u.handle,
    NULL::text AS email,
    u.display_name,
    u.avatar_url,
    COALESCE(wm.role, wi.role) AS role,
    COALESCE(wm.role_title, wi.role_title) AS role_title,
    COALESCE(wm.created_at, wi.created_at) AS created_at,
    (wm.user_id IS NULL) AS pending
   FROM ((workspace_invites wi
     LEFT JOIN workspace_members wm ON (((wi.user_id = wm.user_id) AND (wi.ws_id = wm.ws_id))))
     JOIN users u ON ((wi.user_id = u.id)))
UNION
 SELECT wm.ws_id,
    wm.user_id AS id,
    u.handle,
    upd.email,
    u.display_name,
    u.avatar_url,
    wm.role,
    wm.role_title,
    wm.created_at,
    false AS pending
   FROM ((workspace_members wm
     JOIN users u ON ((wm.user_id = u.id)))
     JOIN user_private_details upd ON ((upd.user_id = u.id)))
UNION
 SELECT wei.ws_id,
    NULL::uuid AS id,
    NULL::text AS handle,
    wei.email,
    NULL::text AS display_name,
    NULL::text AS avatar_url,
    wei.role,
    wei.role_title,
    wei.created_at,
    true AS pending
   FROM workspace_email_invites wei;


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


