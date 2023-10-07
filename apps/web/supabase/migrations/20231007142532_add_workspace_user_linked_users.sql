create table "public"."workspace_user_linked_users" (
    "platform_user_id" uuid not null,
    "virtual_user_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);
alter table "public"."workspace_user_linked_users" enable row level security;
CREATE UNIQUE INDEX workspace_user_linked_users_pkey ON public.workspace_user_linked_users USING btree (platform_user_id, virtual_user_id);
alter table "public"."workspace_user_linked_users"
add constraint "workspace_user_linked_users_pkey" PRIMARY KEY using index "workspace_user_linked_users_pkey";
alter table "public"."workspace_user_linked_users"
add constraint "workspace_user_linked_users_platform_user_id_fkey" FOREIGN KEY (platform_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."workspace_user_linked_users" validate constraint "workspace_user_linked_users_platform_user_id_fkey";
alter table "public"."workspace_user_linked_users"
add constraint "workspace_user_linked_users_virtual_user_id_fkey" FOREIGN KEY (virtual_user_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."workspace_user_linked_users" validate constraint "workspace_user_linked_users_virtual_user_id_fkey";
create policy "Allow insert for workspace users" on "public"."workspace_user_linked_users" as permissive for
insert to authenticated with check (
        (
            (
                (platform_user_id = auth.uid())
                OR (
                    EXISTS (
                        SELECT 1
                        FROM workspace_members wm
                        WHERE (
                                wm.user_id = workspace_user_linked_users.platform_user_id
                            )
                    )
                )
            )
            AND (
                EXISTS (
                    SELECT 1
                    FROM workspace_users wu
                    WHERE (
                            wu.id = workspace_user_linked_users.virtual_user_id
                        )
                )
            )
            AND NOT EXISTS (
                SELECT 1
                FROM workspace_user_linked_users wul
                WHERE (
                        wul.platform_user_id = workspace_user_linked_users.platform_user_id
                        AND wul.virtual_user_id <> workspace_user_linked_users.virtual_user_id
                    )
            )
        )
    );
create policy "Allow select for workspace users" on "public"."workspace_user_linked_users" as permissive for
select to authenticated using (
        (
            (
                (platform_user_id = auth.uid())
                OR (
                    EXISTS (
                        SELECT 1
                        FROM workspace_members wm
                        WHERE (
                                wm.user_id = workspace_user_linked_users.platform_user_id
                            )
                    )
                )
            )
            AND (
                EXISTS (
                    SELECT 1
                    FROM workspace_users wu
                    WHERE (
                            wu.id = workspace_user_linked_users.virtual_user_id
                        )
                )
            )
        )
    );
-- Create a workspace user (in workspace_users) for every entry in the workspace_members table, and link them to the platform user
-- This is a one-time migration to create the workspace_user_linked_users table
-- workspace user id should be the same as the workspace member id (in case of conflict, stop the migration)
-- get the email of the workspace member from the user_private_details table where the user_id matches
-- do everything in a transaction so that if it fails, we can rollback
-- Start a transaction
begin;
with inserted_users as (
    insert into workspace_users (id, ws_id, name, email)
    select uuid_generate_v4(),
        wm.ws_id,
        u.display_name,
        up.email
    from (
            select distinct on (user_id, ws_id) user_id,
                ws_id
            from workspace_members
        ) wm
        join users u on u.id = wm.user_id
        join user_private_details up on up.user_id = wm.user_id
    returning *
)
select *
from workspace_members wm
    join inserted_users iu on iu.ws_id = wm.ws_id
    and iu.user_id = wm.user_id;
insert into workspace_user_linked_users (platform_user_id, virtual_user_id)
select distinct on (wm.user_id) wm.user_id,
    iu.id
from workspace_members wm
    join inserted_users iu on iu.ws_id = wm.ws_id
    and iu.user_id = wm.user_id;
commit;