-- Set up the workspace_default_roles table
create table "public"."workspace_default_roles" ("id" text not null);
insert into "public"."workspace_default_roles" ("id")
values ('MEMBER'),
    ('ADMIN'),
    ('OWNER');
-- Enable row level security for the workspace_default_roles table
alter table "public"."workspace_default_roles" enable row level security;
-- Add a role column to the workspace_members table
alter table "public"."workspace_members"
add column "role" text not null default 'MEMBER'::text;
-- Update the role of the first user with the earliest created_at timestamp to 'OWNER' for each workspace
update "public"."workspace_members" as wm
set role = 'OWNER'
from (
        select wm2.ws_id,
            min(wm2.created_at) as created_at
        from "public"."workspace_members" as wm2
        group by wm2.ws_id
    ) as wm2
where wm.ws_id = wm2.ws_id
    and wm.created_at = wm2.created_at
    and wm.user_id = (
        select wm3.user_id
        from "public"."workspace_members" as wm3
        where wm3.ws_id = wm2.ws_id
            and wm3.role != 'OWNER'
        order by wm3.created_at
        limit 1
    );
alter table "public"."workspace_members"
add column "role_title" text not null default ''::text;
CREATE UNIQUE INDEX workspace_default_roles_pkey ON public.workspace_default_roles USING btree (id);
alter table "public"."workspace_default_roles"
add constraint "workspace_default_roles_pkey" PRIMARY KEY using index "workspace_default_roles_pkey";
alter table "public"."workspace_members"
add constraint "workspace_members_role_fkey" FOREIGN KEY (role) REFERENCES workspace_default_roles(id) not valid;
alter table "public"."workspace_members" validate constraint "workspace_members_role_fkey";
create policy "Enable read access for authenticated users" on "public"."workspace_default_roles" as permissive for
select to authenticated using (true);
drop policy "Allow update for workspace members" on "public"."workspace_members";
drop policy "Enable delete for organization members" on "public"."workspace_members";
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.check_workspace_owners() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN -- Check if any rows in the affected workspace have OWNER role
    IF NOT EXISTS (
        SELECT 1
        FROM "public"."workspace_members"
        WHERE ws_id = NEW.ws_id
            AND role = 'OWNER'
    ) THEN -- If there are no OWNER roles, raise an error
    RAISE EXCEPTION 'Cannot update workspace_members: at least one OWNER role is required in the workspace';
END IF;
RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid, ws_id uuid) RETURNS text LANGUAGE plpgsql AS $function$
DECLARE role text;
BEGIN
SELECT wm.role INTO role
FROM "public"."workspace_members" AS wm
WHERE wm.user_id = get_user_role.user_id
    AND wm.ws_id = get_user_role.ws_id;
RETURN COALESCE(role, 'MEMBER');
END;
$function$;
create policy "Allow update for workspace members" on "public"."workspace_members" as permissive for
update to authenticated using (
        (
            (
                (
                    (get_user_role(auth.uid(), ws_id) = 'ADMIN'::text)
                    AND (role <> 'OWNER'::text)
                )
                OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text)
            )
            AND is_org_member(auth.uid(), ws_id)
        )
    ) with check (
        (
            (
                (
                    (get_user_role(auth.uid(), ws_id) = 'ADMIN'::text)
                    AND (role <> 'OWNER'::text)
                )
                OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text)
            )
            AND is_org_member(auth.uid(), ws_id)
        )
    );
create policy "Enable delete for organization members" on "public"."workspace_members" as permissive for delete to authenticated using (
    (
        is_org_member(auth.uid(), ws_id)
        AND (
            (auth.uid() = user_id)
            OR (
                (get_user_role(auth.uid(), ws_id) = 'ADMIN'::text)
                AND (role <> 'OWNER'::text)
            )
            OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text)
        )
    )
);
CREATE TRIGGER check_workspace_owners_trigger
AFTER
UPDATE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION check_workspace_owners();