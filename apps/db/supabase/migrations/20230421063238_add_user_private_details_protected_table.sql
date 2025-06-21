create table "public"."user_private_details" (
    "user_id" uuid not null,
    "email" text,
    "new_email" text
);
alter table "public"."user_private_details" enable row level security;
CREATE UNIQUE INDEX user_private_details_pkey ON public.user_private_details USING btree (user_id);
alter table "public"."user_private_details"
add constraint "user_private_details_pkey" PRIMARY KEY using index "user_private_details_pkey";
alter table "public"."user_private_details"
add constraint "user_private_details_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;
alter table "public"."user_private_details" validate constraint "user_private_details_user_id_fkey";
create policy "Enable read access for currently signed user" on "public"."user_private_details" as permissive for
select to authenticated using ((user_id = auth.uid()));
INSERT INTO public.user_private_details (user_id, email, new_email)
SELECT id,
    email,
    email_change
FROM auth.users;
alter table "public"."user_private_details"
add column "birthday" date;
UPDATE public.user_private_details
SET birthday = users.birthday
FROM public.users
WHERE users.id = user_private_details.user_id;
CREATE OR REPLACE FUNCTION update_user_private_details() RETURNS trigger AS $$ BEGIN IF (TG_OP = 'INSERT') THEN
INSERT INTO public.user_private_details (user_id, email, new_email)
VALUES (NEW.id, NEW.email, NEW.email_change);
ELSIF (NEW.email <> OLD.email) THEN
UPDATE public.user_private_details
SET email = NEW.email
WHERE user_id = NEW.id;
END IF;
IF (NEW.email_change <> OLD.email_change) THEN
UPDATE public.user_private_details
SET new_email = NEW.email_change
WHERE user_id = NEW.id;
END IF;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER update_user_private_details
AFTER
INSERT
    OR
UPDATE ON auth.users FOR EACH ROW EXECUTE PROCEDURE update_user_private_details();
drop trigger if exists "auth_users_update_trigger" on "auth"."users";
drop function if exists "public"."update_public_users_email"();
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.create_profile_for_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$begin
insert into public.users (id)
values (new.id);
return new;
end;
$function$;
alter table "public"."users" drop column "birthday";
alter table "public"."users" drop column "email";
drop trigger if exists "create_profile_for_new_user_tr" on "auth"."users";
drop trigger if exists "update_user_private_details" on "auth"."users";
drop function if exists "public"."create_profile_for_new_user"();
drop function if exists "public"."update_user_private_details"();
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.sync_user_details() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE BEGIN IF (TG_OP = 'INSERT') THEN
INSERT INTO public.users (id)
VALUES (NEW.id);
INSERT INTO public.user_private_details (user_id, email, new_email)
VALUES (NEW.id, NEW.email, NEW.email_change);
ELSIF (NEW.email <> OLD.email) THEN
UPDATE public.user_private_details
SET email = NEW.email
WHERE user_id = NEW.id;
END IF;
IF (NEW.email_change <> OLD.email_change) THEN
UPDATE public.user_private_details
SET new_email = NEW.email_change
WHERE user_id = NEW.id;
END IF;
RETURN NEW;
END;
$function$;
CREATE TRIGGER sync_user_details
AFTER
INSERT
    OR
UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION sync_user_details();