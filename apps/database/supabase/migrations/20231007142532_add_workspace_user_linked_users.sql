create table "public"."workspace_user_linked_users" (
    "platform_user_id" uuid not null,
    "virtual_user_id" uuid not null,
    "ws_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);
alter table "public"."workspace_user_linked_users" enable row level security;
CREATE UNIQUE INDEX workspace_user_linked_users_pkey ON public.workspace_user_linked_users USING btree (platform_user_id, ws_id);
alter table "public"."workspace_user_linked_users"
add constraint "workspace_user_linked_users_pkey" PRIMARY KEY using index "workspace_user_linked_users_pkey";
alter table "public"."workspace_user_linked_users"
add constraint "workspace_user_linked_users_platform_user_id_fkey" FOREIGN KEY (platform_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."workspace_user_linked_users" validate constraint "workspace_user_linked_users_platform_user_id_fkey";
alter table "public"."workspace_user_linked_users"
add constraint "workspace_user_linked_users_virtual_user_id_fkey" FOREIGN KEY (virtual_user_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."workspace_user_linked_users" validate constraint "workspace_user_linked_users_virtual_user_id_fkey";
alter table "public"."workspace_user_linked_users"
add constraint "workspace_user_linked_users_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."workspace_user_linked_users" validate constraint "workspace_user_linked_users_ws_id_fkey";
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
            AND (
                NOT (
                    EXISTS (
                        SELECT 1
                        FROM workspace_user_linked_users wul
                        WHERE (
                                (
                                    wul.platform_user_id = workspace_user_linked_users.platform_user_id
                                )
                                AND (
                                    wul.virtual_user_id <> workspace_user_linked_users.virtual_user_id
                                )
                            )
                    )
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
begin;
with inserted_users as (
    insert into workspace_users (id, ws_id, name, email)
    select gen_random_uuid(),
        wm.ws_id,
        u.display_name,
        up.email
    from workspace_members wm
        join users u on u.id = wm.user_id
        join user_private_details up on up.user_id = wm.user_id
    where not exists (
            select 1
            from workspace_user_linked_users wul
            where wul.platform_user_id = wm.user_id
                and wul.ws_id = wm.ws_id
        )
    returning *
)
insert into workspace_user_linked_users (platform_user_id, virtual_user_id, ws_id)
select wm.user_id,
    iu.id,
    wm.ws_id
from workspace_members wm
    join inserted_users iu on iu.ws_id = wm.ws_id
    join user_private_details up on up.user_id = wm.user_id
where iu.email = up.email
    and not exists (
        select 1
        from workspace_user_linked_users wul
        where wul.platform_user_id = wm.user_id
            and wul.ws_id = wm.ws_id
    );
commit;
-- Create a trigger to automatically create a workspace user (in workspace_users) for every new entry in the workspace_members table, and link them to the platform user
-- workspace user id should be the same as the workspace member id (in case of conflict, stop the migration)
-- get the email of the workspace member from the user_private_details table where the user_id matches
create or replace function create_workspace_user_linked_user() returns trigger as $$ begin if not exists (
        select 1
        from workspace_users wu
            join user_private_details up on wu.email = up.email
        where up.user_id = new.user_id
            and wu.ws_id = new.ws_id
    )
    and not exists (
        select 1
        from workspace_user_linked_users wul
        where wul.platform_user_id = new.user_id
            and wul.ws_id = new.ws_id
    ) then
insert into workspace_users (id, ws_id, name, email)
select gen_random_uuid(),
    new.ws_id,
    u.display_name,
    up.email
from users u
    join user_private_details up on up.user_id = u.id
where u.id = new.user_id;
insert into workspace_user_linked_users (platform_user_id, virtual_user_id, ws_id)
select new.user_id,
    wu.id,
    new.ws_id
from workspace_users wu
    join user_private_details up on up.email = wu.email
where up.user_id = new.user_id
    and wu.ws_id = new.ws_id;
end if;
return new;
end;
$$ language plpgsql;
create trigger create_workspace_user_linked_user
after
insert on workspace_members for each row execute procedure create_workspace_user_linked_user();
drop policy "Allow insert for workspace users" on "public"."workspace_user_linked_users";
drop policy "Allow select for workspace users" on "public"."workspace_user_linked_users";
create policy "Allow insert for workspace users" on "public"."workspace_user_linked_users" as permissive for
insert to authenticated with check (
        (
            (
                (platform_user_id = auth.uid())
                OR (
                    EXISTS (
                        SELECT 1
                        FROM workspace_members wm
                        WHERE wm.user_id = workspace_user_linked_users.platform_user_id
                            AND wm.ws_id = workspace_user_linked_users.ws_id
                    )
                )
            )
            AND (
                EXISTS (
                    SELECT 1
                    FROM workspace_users wu
                    WHERE wu.id = workspace_user_linked_users.virtual_user_id
                        AND wu.ws_id = workspace_user_linked_users.ws_id
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
                        WHERE wm.user_id = workspace_user_linked_users.platform_user_id
                            AND wm.ws_id = workspace_user_linked_users.ws_id
                    )
                )
            )
            AND (
                EXISTS (
                    SELECT 1
                    FROM workspace_users wu
                    WHERE wu.id = workspace_user_linked_users.virtual_user_id
                        AND wu.ws_id = workspace_user_linked_users.ws_id
                )
            )
        )
    );
-- Create a trigger that automatically deletes the workspace member if a linked user is deleted
create or replace function delete_workspace_member_when_unlink() returns trigger as $$ begin
delete from workspace_members wm
where wm.user_id = old.platform_user_id
    and wm.ws_id = old.ws_id;
return old;
end;
$$ language plpgsql;
create trigger delete_workspace_member_when_unlink
after delete on workspace_user_linked_users for each row execute procedure delete_workspace_member_when_unlink();