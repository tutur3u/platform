alter table "public"."workspace_invites"
add column "role" text not null default 'MEMBER'::text;
alter table "public"."workspace_invites"
add column "role_title" text;
alter table "public"."workspace_invites"
add constraint "workspace_invites_role_fkey" FOREIGN KEY (role) REFERENCES workspace_default_roles(id) not valid;
alter table "public"."workspace_invites" validate constraint "workspace_invites_role_fkey";
-- Add a public.workspace_members_and_invites view that combines workspace_members and workspace_invites
-- which has the following fields: ws_id(uuid), id(uuid - from user_id field),
-- handle(text - from public.users.handle where public.users.id = user_id),
-- display_name(text - from public.users.handle where public.users.id = user_id),
-- avatar_url(text - from public.users.handle where public.users.id = user_id),
-- role(text), role_title(text), created_at(timestamptz), pending(boolean - true if is from workspace_invites)
-- Order by pending, created_at
CREATE OR REPLACE VIEW "public"."workspace_members_and_invites" AS
SELECT wi.ws_id AS ws_id,
    u.id AS id,
    u.handle AS handle,
    u.display_name AS display_name,
    u.avatar_url AS avatar_url,
    CASE
        WHEN wm.user_id IS NOT NULL THEN wm.role
        ELSE wi.role
    END AS role,
    CASE
        WHEN wm.user_id IS NOT NULL THEN wm.role_title
        ELSE wi.role_title
    END AS role_title,
    CASE
        WHEN wm.user_id IS NOT NULL THEN wm.created_at
        ELSE wi.created_at
    END AS created_at,
    CASE
        WHEN wm.user_id IS NOT NULL THEN false
        ELSE true
    END AS pending
FROM public.workspace_invites wi
    LEFT JOIN public.workspace_members wm ON wi.user_id = wm.user_id
    INNER JOIN public.users u ON wi.user_id = u.id
UNION
SELECT wm.ws_id AS ws_id,
    u.id AS id,
    u.handle AS handle,
    u.display_name AS display_name,
    u.avatar_url AS avatar_url,
    wm.role AS role,
    wm.role_title AS role_title,
    wm.created_at AS created_at,
    false AS pending
FROM public.workspace_members wm
    INNER JOIN public.users u ON wm.user_id = u.id
ORDER BY pending,
    created_at;