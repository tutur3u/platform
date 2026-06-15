-- External profile-completion links.
--
-- Workspace members with the `manage_user_profile_links` permission generate a
-- shareable link and send it to an external person, who must log in before
-- completing a limited set of profile fields on a workspace_users row.
--
-- Two modes:
--   * per_user  -> targets one existing workspace_users row (target_user_id set)
--   * generic   -> reusable; each external user gets their own workspace_users row
--
-- Mirrors the workspace_invite_links design (table + uses/submissions tracking +
-- _with_stats view + permission-gated RLS).

-- ---------------------------------------------------------------------------
-- workspace_user_profile_links
-- ---------------------------------------------------------------------------
create table "public"."workspace_user_profile_links" (
  "id" uuid not null default gen_random_uuid(),
  "ws_id" uuid not null,
  "code" text not null,
  "creator_id" uuid not null,
  "mode" text not null default 'per_user'::text,
  "target_user_id" uuid,
  "allowed_fields" text[] not null default '{}'::text[],
  "max_uses" integer,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now()
);

alter table "public"."workspace_user_profile_links" enable row level security;

-- Mode must be one of the supported values.
alter table "public"."workspace_user_profile_links"
  add constraint "workspace_user_profile_links_mode_check"
  CHECK (mode = ANY (ARRAY['per_user'::text, 'generic'::text]));

-- Mode invariant: per_user requires a target, generic forbids one.
alter table "public"."workspace_user_profile_links"
  add constraint "workspace_user_profile_links_mode_target_check"
  CHECK (
    (mode = 'per_user'::text AND target_user_id IS NOT NULL)
    OR (mode = 'generic'::text AND target_user_id IS NULL)
  );

-- allowed_fields must be a non-empty subset of the supported field set.
alter table "public"."workspace_user_profile_links"
  add constraint "workspace_user_profile_links_allowed_fields_check"
  CHECK (
    cardinality(allowed_fields) >= 1
    AND allowed_fields <@ ARRAY[
      'display_name'::text,
      'full_name'::text,
      'birthday'::text,
      'gender'::text,
      'avatar_url'::text,
      'email'::text
    ]
  );

CREATE UNIQUE INDEX workspace_user_profile_links_code_key
  ON public.workspace_user_profile_links USING btree (code);
CREATE INDEX workspace_user_profile_links_ws_id_idx
  ON public.workspace_user_profile_links USING btree (ws_id);
CREATE INDEX workspace_user_profile_links_expires_at_idx
  ON public.workspace_user_profile_links USING btree (expires_at);
CREATE INDEX workspace_user_profile_links_target_user_id_idx
  ON public.workspace_user_profile_links USING btree (target_user_id);

CREATE UNIQUE INDEX workspace_user_profile_links_pkey
  ON public.workspace_user_profile_links USING btree (id);
alter table "public"."workspace_user_profile_links"
  add constraint "workspace_user_profile_links_pkey"
  PRIMARY KEY using index "workspace_user_profile_links_pkey";

alter table "public"."workspace_user_profile_links"
  add constraint "workspace_user_profile_links_ws_id_fkey"
  FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE
  not valid;
alter table "public"."workspace_user_profile_links"
  validate constraint "workspace_user_profile_links_ws_id_fkey";

alter table "public"."workspace_user_profile_links"
  add constraint "workspace_user_profile_links_creator_id_fkey"
  FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
  not valid;
alter table "public"."workspace_user_profile_links"
  validate constraint "workspace_user_profile_links_creator_id_fkey";

alter table "public"."workspace_user_profile_links"
  add constraint "workspace_user_profile_links_target_user_id_fkey"
  FOREIGN KEY (target_user_id) REFERENCES workspace_users(id)
  ON UPDATE CASCADE ON DELETE CASCADE
  not valid;
alter table "public"."workspace_user_profile_links"
  validate constraint "workspace_user_profile_links_target_user_id_fkey";

-- ---------------------------------------------------------------------------
-- workspace_user_profile_link_submissions
-- ---------------------------------------------------------------------------
create table "public"."workspace_user_profile_link_submissions" (
  "id" uuid not null default gen_random_uuid(),
  "profile_link_id" uuid not null,
  "ws_id" uuid not null,
  "workspace_user_id" uuid not null,
  "actor_auth_uid" uuid,
  "submitted_fields" text[] not null,
  "created_at" timestamp with time zone not null default now()
);

alter table "public"."workspace_user_profile_link_submissions" enable row level security;

CREATE INDEX workspace_user_profile_link_submissions_profile_link_id_idx
  ON public.workspace_user_profile_link_submissions USING btree (profile_link_id);
CREATE INDEX workspace_user_profile_link_submissions_ws_id_idx
  ON public.workspace_user_profile_link_submissions USING btree (ws_id);
CREATE INDEX workspace_user_profile_link_submissions_workspace_user_id_idx
  ON public.workspace_user_profile_link_submissions USING btree (workspace_user_id);
CREATE INDEX workspace_user_profile_link_submissions_actor_auth_uid_idx
  ON public.workspace_user_profile_link_submissions USING btree (actor_auth_uid);

CREATE UNIQUE INDEX workspace_user_profile_link_submissions_pkey
  ON public.workspace_user_profile_link_submissions USING btree (id);
alter table "public"."workspace_user_profile_link_submissions"
  add constraint "workspace_user_profile_link_submissions_pkey"
  PRIMARY KEY using index "workspace_user_profile_link_submissions_pkey";

alter table "public"."workspace_user_profile_link_submissions"
  add constraint "workspace_user_profile_link_submissions_profile_link_id_fkey"
  FOREIGN KEY (profile_link_id) REFERENCES workspace_user_profile_links(id)
  ON UPDATE CASCADE ON DELETE CASCADE
  not valid;
alter table "public"."workspace_user_profile_link_submissions"
  validate constraint "workspace_user_profile_link_submissions_profile_link_id_fkey";

alter table "public"."workspace_user_profile_link_submissions"
  add constraint "workspace_user_profile_link_submissions_ws_id_fkey"
  FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE
  not valid;
alter table "public"."workspace_user_profile_link_submissions"
  validate constraint "workspace_user_profile_link_submissions_ws_id_fkey";

alter table "public"."workspace_user_profile_link_submissions"
  add constraint "workspace_user_profile_link_submissions_workspace_user_id_fkey"
  FOREIGN KEY (workspace_user_id) REFERENCES workspace_users(id)
  ON UPDATE CASCADE ON DELETE CASCADE
  not valid;
alter table "public"."workspace_user_profile_link_submissions"
  validate constraint "workspace_user_profile_link_submissions_workspace_user_id_fkey";

alter table "public"."workspace_user_profile_link_submissions"
  add constraint "workspace_user_profile_link_submissions_actor_auth_uid_fkey"
  FOREIGN KEY (actor_auth_uid) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
  not valid;
alter table "public"."workspace_user_profile_link_submissions"
  validate constraint "workspace_user_profile_link_submissions_actor_auth_uid_fkey";

-- ---------------------------------------------------------------------------
-- workspace_user_profile_links_with_stats view
-- ---------------------------------------------------------------------------
create or replace view "public"."workspace_user_profile_links_with_stats" as
SELECT
  wupl.id,
  wupl.ws_id,
  wupl.code,
  wupl.creator_id,
  wupl.mode,
  wupl.target_user_id,
  wupl.allowed_fields,
  wupl.max_uses,
  wupl.expires_at,
  wupl.revoked_at,
  wupl.created_at,
  wupl.updated_at,
  COUNT(wupls.id) as current_uses,
  CASE
    WHEN wupl.expires_at IS NOT NULL AND wupl.expires_at < now() THEN true
    ELSE false
  END as is_expired,
  CASE
    WHEN wupl.max_uses IS NOT NULL AND COUNT(wupls.id) >= wupl.max_uses THEN true
    ELSE false
  END as is_full,
  CASE
    WHEN wupl.revoked_at IS NOT NULL THEN true
    ELSE false
  END as is_revoked
FROM workspace_user_profile_links wupl
LEFT JOIN workspace_user_profile_link_submissions wupls
  ON wupl.id = wupls.profile_link_id
GROUP BY
  wupl.id, wupl.ws_id, wupl.code, wupl.creator_id, wupl.mode,
  wupl.target_user_id, wupl.allowed_fields, wupl.max_uses, wupl.expires_at,
  wupl.revoked_at, wupl.created_at, wupl.updated_at;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select on table "public"."workspace_user_profile_links" to "authenticated";
grant insert on table "public"."workspace_user_profile_links" to "authenticated";
grant update on table "public"."workspace_user_profile_links" to "authenticated";
grant delete on table "public"."workspace_user_profile_links" to "authenticated";

grant select on table "public"."workspace_user_profile_link_submissions" to "authenticated";
grant insert on table "public"."workspace_user_profile_link_submissions" to "authenticated";

grant select on "public"."workspace_user_profile_links_with_stats" to "authenticated";

grant all on table "public"."workspace_user_profile_links" to "service_role";
grant all on table "public"."workspace_user_profile_link_submissions" to "service_role";
grant select on "public"."workspace_user_profile_links_with_stats" to "service_role";

-- ---------------------------------------------------------------------------
-- RLS policies for workspace_user_profile_links
-- ---------------------------------------------------------------------------

-- Allow workspace members to view profile links for their workspace.
create policy "Allow workspace members to view profile links"
on "public"."workspace_user_profile_links"
as permissive
for select
to authenticated
using (is_org_member(auth.uid(), ws_id));

-- Allow members with manage_user_profile_links permission to create links.
create policy "Allow members to create profile links"
on "public"."workspace_user_profile_links"
as permissive
for insert
to authenticated
with check (
  ws_id IN (
    SELECT wrp.ws_id
    FROM workspace_role_members wrm
    JOIN workspace_role_permissions wrp
      ON wrp.role_id = wrm.role_id
      AND wrp.ws_id = workspace_user_profile_links.ws_id
    WHERE wrm.user_id = auth.uid()
      AND wrp.permission = 'manage_user_profile_links'
      AND wrp.enabled = true

    UNION

    SELECT wdp.ws_id
    FROM workspace_default_permissions wdp
    WHERE wdp.ws_id = workspace_user_profile_links.ws_id
      AND wdp.permission = 'manage_user_profile_links'
      AND wdp.enabled = true
      AND EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.ws_id = workspace_user_profile_links.ws_id
        AND wm.user_id = auth.uid()
      )
  )
);

-- Allow members with manage_user_profile_links permission to update links.
create policy "Allow members to update profile links"
on "public"."workspace_user_profile_links"
as permissive
for update
to authenticated
using (
  ws_id IN (
    SELECT wrp.ws_id
    FROM workspace_role_members wrm
    JOIN workspace_role_permissions wrp
      ON wrp.role_id = wrm.role_id
      AND wrp.ws_id = workspace_user_profile_links.ws_id
    WHERE wrm.user_id = auth.uid()
      AND wrp.permission = 'manage_user_profile_links'
      AND wrp.enabled = true

    UNION

    SELECT wdp.ws_id
    FROM workspace_default_permissions wdp
    WHERE wdp.ws_id = workspace_user_profile_links.ws_id
      AND wdp.permission = 'manage_user_profile_links'
      AND wdp.enabled = true
      AND EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.ws_id = workspace_user_profile_links.ws_id
        AND wm.user_id = auth.uid()
      )
  )
)
with check (
  ws_id IN (
    SELECT wrp.ws_id
    FROM workspace_role_members wrm
    JOIN workspace_role_permissions wrp
      ON wrp.role_id = wrm.role_id
      AND wrp.ws_id = workspace_user_profile_links.ws_id
    WHERE wrm.user_id = auth.uid()
      AND wrp.permission = 'manage_user_profile_links'
      AND wrp.enabled = true

    UNION

    SELECT wdp.ws_id
    FROM workspace_default_permissions wdp
    WHERE wdp.ws_id = workspace_user_profile_links.ws_id
      AND wdp.permission = 'manage_user_profile_links'
      AND wdp.enabled = true
      AND EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.ws_id = workspace_user_profile_links.ws_id
        AND wm.user_id = auth.uid()
      )
  )
);

-- Allow members with manage_user_profile_links permission to delete links.
create policy "Allow members to delete profile links"
on "public"."workspace_user_profile_links"
as permissive
for delete
to authenticated
using (
  ws_id IN (
    SELECT wrp.ws_id
    FROM workspace_role_members wrm
    JOIN workspace_role_permissions wrp
      ON wrp.role_id = wrm.role_id
      AND wrp.ws_id = workspace_user_profile_links.ws_id
    WHERE wrm.user_id = auth.uid()
      AND wrp.permission = 'manage_user_profile_links'
      AND wrp.enabled = true

    UNION

    SELECT wdp.ws_id
    FROM workspace_default_permissions wdp
    WHERE wdp.ws_id = workspace_user_profile_links.ws_id
      AND wdp.permission = 'manage_user_profile_links'
      AND wdp.enabled = true
      AND EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.ws_id = workspace_user_profile_links.ws_id
        AND wm.user_id = auth.uid()
      )
  )
);

-- ---------------------------------------------------------------------------
-- RLS policies for workspace_user_profile_link_submissions
-- ---------------------------------------------------------------------------

-- Allow workspace members to view submission history for their workspace.
-- (Inserts are performed by the public submit endpoint via service_role, which
-- bypasses RLS, mirroring the invite-link join endpoint.)
create policy "Allow workspace members to view profile link submissions"
on "public"."workspace_user_profile_link_submissions"
as permissive
for select
to authenticated
using (is_org_member(auth.uid(), ws_id));

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_workspace_user_profile_links_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_update_workspace_user_profile_links_updated_at
BEFORE UPDATE ON workspace_user_profile_links
FOR EACH ROW
EXECUTE FUNCTION update_workspace_user_profile_links_updated_at();
