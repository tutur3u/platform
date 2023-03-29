alter table "public"."users" drop constraint "users_username_key";
drop index if exists "public"."users_username_key";
create table "public"."handles" (
    "value" text not null,
    "creator_id" uuid,
    "created_at" timestamp with time zone default now()
);
alter table "public"."handles" enable row level security;
create table "public"."workspace_presets" (
    "name" text not null,
    "enabled" boolean not null default true
);
alter table "public"."workspace_presets" enable row level security;
alter table "public"."users"
    rename column "username" to "handle";
alter table "public"."workspaces"
add column "handle" text;
alter table "public"."workspaces"
add column "preset" text default ''::text;
CREATE UNIQUE INDEX handles_pkey ON public.handles USING btree (value);
CREATE UNIQUE INDEX workspace_presets_pkey ON public.workspace_presets USING btree (name);
CREATE UNIQUE INDEX workspaces_handle_key ON public.workspaces USING btree (handle);
CREATE UNIQUE INDEX users_username_key ON public.users USING btree (handle);
alter table "public"."handles"
add constraint "handles_pkey" PRIMARY KEY using index "handles_pkey";
alter table "public"."workspace_presets"
add constraint "workspace_presets_pkey" PRIMARY KEY using index "workspace_presets_pkey";
alter table "public"."handles"
add constraint "handles_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) not valid;
alter table "public"."handles" validate constraint "handles_creator_id_fkey";
create policy "Enable read access for authenticated users" on "public"."workspace_presets" as permissive for
select to authenticated using (true);
alter table "public"."users"
alter column "handle" drop not null;
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.update_handle() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN -- Check if the new handle is already taken
    IF NEW.handle IS NOT NULL
    AND EXISTS (
        SELECT 1
        FROM handles
        WHERE value = NEW.handle
            AND creator_id != NEW.id
    ) THEN RAISE EXCEPTION 'Handle already taken';
END IF;
-- Remove the old handle if it has been changed
IF TG_OP = 'UPDATE'
AND OLD.handle IS NOT NULL
AND OLD.handle <> NEW.handle THEN
DELETE FROM handles
WHERE creator_id = OLD.id;
END IF;
-- Insert or update the handle in the handles table
IF NEW.handle IS NOT NULL THEN BEGIN
INSERT INTO handles (creator_id, value)
VALUES (NEW.id, NEW.handle);
EXCEPTION
WHEN unique_violation THEN
UPDATE handles
SET value = NEW.handle
WHERE creator_id = NEW.id;
END;
END IF;
RETURN NEW;
END;
$function$;
create policy "Enable delete for users based on user_id" on "public"."handles" as permissive for delete to authenticated using (
    (
        EXISTS (
            SELECT 1
            FROM users u
            WHERE (
                    (auth.uid() = u.id)
                    AND (handles.value = u.handle)
                )
        )
    )
);
create policy "Enable insert for authenticated users only" on "public"."handles" as permissive for
insert to authenticated with check (true);
CREATE TRIGGER update_handle_trigger BEFORE
INSERT
    OR
UPDATE OF handle ON public.users FOR EACH ROW EXECUTE FUNCTION update_handle();
create policy "Enable insert for authenticated users only" on "storage"."buckets" as permissive for
insert to authenticated with check (true);
create policy "Enable insert for authenticated users only" on "storage"."objects" as permissive for
insert to authenticated with check (true);