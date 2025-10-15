-- Create workspace_invite_links table
create table "public"."workspace_invite_links" (
  "id" uuid not null default gen_random_uuid(),
  "ws_id" uuid not null,
  "code" text not null,
  "creator_id" uuid not null,
  "role" text not null default 'MEMBER'::text,
  "role_title" text not null default ''::text,
  "max_uses" integer,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now()
);

-- Enable RLS
alter table "public"."workspace_invite_links" enable row level security;

-- Create unique index on code
CREATE UNIQUE INDEX workspace_invite_links_code_key ON public.workspace_invite_links USING btree (code);

-- Create index on ws_id for faster lookups
CREATE INDEX workspace_invite_links_ws_id_idx ON public.workspace_invite_links USING btree (ws_id);

-- Create index on expires_at for cleanup queries
CREATE INDEX workspace_invite_links_expires_at_idx ON public.workspace_invite_links USING btree (expires_at);

-- Create primary key
CREATE UNIQUE INDEX workspace_invite_links_pkey ON public.workspace_invite_links USING btree (id);
alter table "public"."workspace_invite_links" add constraint "workspace_invite_links_pkey" PRIMARY KEY using index "workspace_invite_links_pkey";

-- Add foreign key constraints
alter table "public"."workspace_invite_links" add constraint "workspace_invite_links_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."workspace_invite_links" validate constraint "workspace_invite_links_ws_id_fkey";

alter table "public"."workspace_invite_links" add constraint "workspace_invite_links_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."workspace_invite_links" validate constraint "workspace_invite_links_creator_id_fkey";

alter table "public"."workspace_invite_links" add constraint "workspace_invite_links_role_fkey" FOREIGN KEY (role) REFERENCES workspace_default_roles(id) ON UPDATE CASCADE not valid;
alter table "public"."workspace_invite_links" validate constraint "workspace_invite_links_role_fkey";

-- Create workspace_invite_link_uses table to track who joined via each link
create table "public"."workspace_invite_link_uses" (
  "id" uuid not null default gen_random_uuid(),
  "invite_link_id" uuid not null,
  "user_id" uuid not null,
  "ws_id" uuid not null,
  "joined_at" timestamp with time zone not null default now()
);

-- Enable RLS
alter table "public"."workspace_invite_link_uses" enable row level security;

-- Create indexes
CREATE INDEX workspace_invite_link_uses_invite_link_id_idx ON public.workspace_invite_link_uses USING btree (invite_link_id);
CREATE INDEX workspace_invite_link_uses_user_id_idx ON public.workspace_invite_link_uses USING btree (user_id);
CREATE INDEX workspace_invite_link_uses_ws_id_idx ON public.workspace_invite_link_uses USING btree (ws_id);

-- Create primary key
CREATE UNIQUE INDEX workspace_invite_link_uses_pkey ON public.workspace_invite_link_uses USING btree (id);
alter table "public"."workspace_invite_link_uses" add constraint "workspace_invite_link_uses_pkey" PRIMARY KEY using index "workspace_invite_link_uses_pkey";

-- Add foreign key constraints
alter table "public"."workspace_invite_link_uses" add constraint "workspace_invite_link_uses_invite_link_id_fkey" FOREIGN KEY (invite_link_id) REFERENCES workspace_invite_links(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."workspace_invite_link_uses" validate constraint "workspace_invite_link_uses_invite_link_id_fkey";

alter table "public"."workspace_invite_link_uses" add constraint "workspace_invite_link_uses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."workspace_invite_link_uses" validate constraint "workspace_invite_link_uses_user_id_fkey";

alter table "public"."workspace_invite_link_uses" add constraint "workspace_invite_link_uses_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."workspace_invite_link_uses" validate constraint "workspace_invite_link_uses_ws_id_fkey";

-- Create a view for invite links with usage stats
create or replace view "public"."workspace_invite_links_with_stats" as
SELECT
  wil.id,
  wil.ws_id,
  wil.code,
  wil.creator_id,
  wil.role,
  wil.role_title,
  wil.max_uses,
  wil.expires_at,
  wil.created_at,
  wil.updated_at,
  COUNT(wilu.id) as current_uses,
  CASE
    WHEN wil.expires_at IS NOT NULL AND wil.expires_at < now() THEN true
    ELSE false
  END as is_expired,
  CASE
    WHEN wil.max_uses IS NOT NULL AND COUNT(wilu.id) >= wil.max_uses THEN true
    ELSE false
  END as is_full
FROM workspace_invite_links wil
LEFT JOIN workspace_invite_link_uses wilu ON wil.id = wilu.invite_link_id
GROUP BY wil.id, wil.ws_id, wil.code, wil.creator_id, wil.role, wil.role_title, wil.max_uses, wil.expires_at, wil.created_at, wil.updated_at;

-- Grant permissions
grant select on table "public"."workspace_invite_links" to "authenticated";
grant insert on table "public"."workspace_invite_links" to "authenticated";
grant update on table "public"."workspace_invite_links" to "authenticated";
grant delete on table "public"."workspace_invite_links" to "authenticated";

grant select on table "public"."workspace_invite_link_uses" to "authenticated";
grant insert on table "public"."workspace_invite_link_uses" to "authenticated";

grant select on "public"."workspace_invite_links_with_stats" to "authenticated";

grant all on table "public"."workspace_invite_links" to "service_role";
grant all on table "public"."workspace_invite_link_uses" to "service_role";
grant select on "public"."workspace_invite_links_with_stats" to "service_role";

-- RLS Policies for workspace_invite_links

-- Allow workspace members to view invite links for their workspace
create policy "Allow workspace members to view invite links"
on "public"."workspace_invite_links"
as permissive
for select
to authenticated
using (is_org_member(auth.uid(), ws_id));

-- Allow workspace members with manage_workspace_members permission to create invite links
-- Also respect DISABLE_INVITE workspace secret
create policy "Allow workspace members to create invite links"
on "public"."workspace_invite_links"
as permissive
for insert
to authenticated
with check (
  is_org_member(auth.uid(), ws_id)
  AND (NOT EXISTS (
    SELECT 1
    FROM workspace_secrets wss
    WHERE wss.ws_id = workspace_invite_links.ws_id
    AND wss.name = 'DISABLE_INVITE'::text
  ))
);

-- Allow workspace members with manage_workspace_members permission to update invite links
create policy "Allow workspace members to update invite links"
on "public"."workspace_invite_links"
as permissive
for update
to authenticated
using (is_org_member(auth.uid(), ws_id))
with check (is_org_member(auth.uid(), ws_id));

-- Allow workspace members with manage_workspace_members permission to delete invite links
create policy "Allow workspace members to delete invite links"
on "public"."workspace_invite_links"
as permissive
for delete
to authenticated
using (is_org_member(auth.uid(), ws_id));

-- RLS Policies for workspace_invite_link_uses

-- Allow workspace members to view usage history for their workspace
create policy "Allow workspace members to view invite link uses"
on "public"."workspace_invite_link_uses"
as permissive
for select
to authenticated
using (is_org_member(auth.uid(), ws_id));

-- Allow authenticated users to insert their own usage record (handled by API with additional validation)
create policy "Allow authenticated users to record invite link usage"
on "public"."workspace_invite_link_uses"
as permissive
for insert
to authenticated
with check (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_workspace_invite_links_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Create trigger to update updated_at on row updates
CREATE TRIGGER trg_update_workspace_invite_links_updated_at
BEFORE UPDATE ON workspace_invite_links
FOR EACH ROW
EXECUTE FUNCTION update_workspace_invite_links_updated_at();
