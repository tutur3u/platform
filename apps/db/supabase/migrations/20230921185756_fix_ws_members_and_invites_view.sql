CREATE INDEX wm_user_ws_idx ON workspace_members (user_id, ws_id);
DROP VIEW IF EXISTS public.workspace_members_and_invites;
CREATE VIEW public.workspace_members_and_invites AS
SELECT wi.ws_id,
    u.id,
    u.handle,
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
    NULL,
    NULL,
    NULL,
    wm.role,
    wm.role_title,
    wm.created_at,
    FALSE AS pending
FROM workspace_members wm;