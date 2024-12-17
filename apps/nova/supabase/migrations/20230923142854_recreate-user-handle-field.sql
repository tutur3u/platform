drop policy "Enable delete for users based on user_id" on "public"."handles";
alter table "public"."users" drop constraint "users_handle_fkey";
alter table "public"."users" drop constraint "users_handle_key";
drop view if exists "public"."calendar_event_participants";
drop view if exists "public"."workspace_members_and_invites";
drop index if exists "public"."idx_trgm_users_search_fields";
drop index if exists "public"."idx_users_search";
drop index if exists "public"."users_handle_key";
drop index if exists "public"."users_username_key";
alter table "public"."users" drop column "handle";
alter table "public"."users"
add column "handle" text;
CREATE UNIQUE INDEX users_handle_key ON public.users USING btree (handle);
alter table "public"."users"
add constraint "users_handle_fkey" FOREIGN KEY (handle) REFERENCES handles(value) ON UPDATE CASCADE ON DELETE
SET DEFAULT not valid;
alter table "public"."users" validate constraint "users_handle_fkey";
alter table "public"."users"
add constraint "users_handle_key" UNIQUE using index "users_handle_key";
create or replace view "public"."calendar_event_participants" as
SELECT p.event_id,
    p.user_id AS participant_id,
    p.going,
    u.display_name,
    u.handle,
    'platform_user'::text AS type,
    p.created_at
FROM (
        calendar_event_platform_participants p
        JOIN users u ON ((u.id = p.user_id))
    )
UNION
SELECT p.event_id,
    p.user_id AS participant_id,
    p.going,
    u.name AS display_name,
    COALESCE(u.phone, u.email) AS handle,
    'virtual_user'::text AS type,
    p.created_at
FROM (
        calendar_event_virtual_participants p
        JOIN workspace_users u ON ((u.id = p.user_id))
    )
UNION
SELECT p.event_id,
    p.group_id AS participant_id,
    NULL::boolean AS going,
    g.name AS display_name,
    NULL::text AS handle,
    'user_group'::text AS type,
    p.created_at
FROM (
        calendar_event_participant_groups p
        JOIN workspace_user_groups g ON ((g.id = p.group_id))
    );
CREATE VIEW public.workspace_members_and_invites AS
SELECT wi.ws_id,
    u.id,
    u.handle,
    NULL as email,
    u.display_name,
    u.avatar_url,
    COALESCE(wm.role, wi.role) AS role,
    COALESCE(wm.role_title, wi.role_title) AS role_title,
    COALESCE(wm.created_at, wi.created_at) AS created_at,
    (wm.user_id IS NULL) AS pending
FROM workspace_invites wi
    LEFT JOIN workspace_members wm ON wi.user_id = wm.user_id
    AND wi.ws_id = wm.ws_id
    JOIN users u ON wi.user_id = u.id
UNION
SELECT wm.ws_id,
    wm.user_id,
    u.handle,
    upd.email,
    u.display_name,
    u.avatar_url,
    wm.role,
    wm.role_title,
    wm.created_at,
    FALSE AS pending
FROM workspace_members wm
    JOIN users u ON wm.user_id = u.id
    JOIN user_private_details upd ON upd.user_id = u.id;