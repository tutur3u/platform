-- change "nova_roles" to "platform_email_roles"
ALTER TABLE "nova_roles" RENAME TO "platform_email_roles";

-- add "platform_user_roles" table
CREATE TABLE "platform_user_roles" (
    "user_id" uuid NOT NULL REFERENCES "users"("id"),
    "enabled" boolean NOT NULL DEFAULT true,
    "allow_challenge_management" boolean NOT NULL DEFAULT false,
    "allow_manage_all_challenges" boolean NOT NULL DEFAULT false,
    "allow_role_management" boolean NOT NULL DEFAULT false,
    "created_at" timestamp NOT NULL DEFAULT now()
);

alter table "public"."platform_user_roles" drop constraint "platform_user_roles_user_id_fkey";

alter table "public"."platform_email_roles" drop constraint "nova_roles_pkey";

drop index if exists "public"."nova_roles_pkey";

alter table "public"."platform_email_roles" drop column "id";

alter table "public"."platform_email_roles" alter column "email" set not null;

alter table "public"."platform_user_roles" alter column "created_at" set data type timestamp with time zone using "created_at"::timestamp with time zone;

alter table "public"."platform_user_roles" enable row level security;

CREATE UNIQUE INDEX platform_email_roles_pkey ON public.platform_email_roles USING btree (email);

CREATE UNIQUE INDEX platform_user_roles_pkey ON public.platform_user_roles USING btree (user_id);

alter table "public"."platform_email_roles" add constraint "platform_email_roles_pkey" PRIMARY KEY using index "platform_email_roles_pkey";

alter table "public"."platform_user_roles" add constraint "platform_user_roles_pkey" PRIMARY KEY using index "platform_user_roles_pkey";

alter table "public"."platform_user_roles" add constraint "platform_user_roles_user_id_fkey1" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."platform_user_roles" validate constraint "platform_user_roles_user_id_fkey1";

-- Update the create_user_profile function
CREATE OR REPLACE FUNCTION public.create_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ 
DECLARE
  email_role RECORD;
BEGIN
  -- Insert the user ID into public.users
  INSERT INTO public.users (id)
  VALUES (NEW.id);
  
  -- Check if the email exists in platform_email_roles
  SELECT * INTO email_role FROM public.platform_email_roles
  WHERE email = NEW.email;
  
  -- If email exists in platform_email_roles, use those settings
  IF FOUND THEN
    -- Add user to platform_user_roles with settings from platform_email_roles
    INSERT INTO public.platform_user_roles(
      user_id, 
      enabled, 
      allow_challenge_management, 
      allow_manage_all_challenges, 
      allow_role_management
    )
    VALUES (
      NEW.id, 
      email_role.enabled, 
      email_role.allow_challenge_management, 
      email_role.allow_manage_all_challenges, 
      email_role.allow_role_management
    );
    
    -- Delete the entry from platform_email_roles
    DELETE FROM public.platform_email_roles
    WHERE email = NEW.email;
  ELSE
    -- Default behavior: add user to platform_user_roles with default settings
    INSERT INTO public.platform_user_roles(user_id, enabled)
    VALUES (NEW.id, false);
  END IF;
  
  RETURN NEW;
END;
$function$
;

-- Add trigger to remove matching email from platform_email_roles when user is added to platform_user_roles
CREATE OR REPLACE FUNCTION public.cleanup_platform_email_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM public.platform_email_roles per
  WHERE per.email = (
    SELECT upd.email
    FROM public.user_private_details upd
    WHERE upd.user_id = NEW.user_id
  );
  RETURN NEW;
END;
$function$
;

CREATE TRIGGER cleanup_platform_email_roles_trigger
AFTER INSERT ON public.platform_user_roles
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_platform_email_roles();

-- Add function and trigger to redirect inserts to platform_email_roles to platform_user_roles when email exists in user_private_details
CREATE OR REPLACE FUNCTION public.redirect_platform_email_roles_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  user_id_var uuid;
BEGIN
  -- Check if email exists in user_private_details
  SELECT upd.user_id INTO user_id_var
  FROM public.user_private_details upd
  WHERE upd.email = NEW.email;
  
  -- If email exists in user_private_details
  IF user_id_var IS NOT NULL THEN
    -- Add or update the user in platform_user_roles instead
    INSERT INTO public.platform_user_roles(
      user_id, 
      enabled, 
      allow_challenge_management, 
      allow_manage_all_challenges, 
      allow_role_management
    )
    VALUES (
      user_id_var, 
      NEW.enabled, 
      NEW.allow_challenge_management, 
      NEW.allow_manage_all_challenges, 
      NEW.allow_role_management
    )
    ON CONFLICT (user_id) 
    DO UPDATE SET
      enabled = NEW.enabled,
      allow_challenge_management = NEW.allow_challenge_management,
      allow_manage_all_challenges = NEW.allow_manage_all_challenges, 
      allow_role_management = NEW.allow_role_management;
      
    -- Skip the insert to platform_email_roles
    RETURN NULL;
  END IF;
  
  -- If email doesn't exist in user_private_details, proceed with normal insert
  RETURN NEW;
END;
$function$
;

CREATE TRIGGER redirect_platform_email_roles_trigger
BEFORE INSERT ON public.platform_email_roles
FOR EACH ROW
EXECUTE FUNCTION public.redirect_platform_email_roles_insert();

drop policy "allow_user_to_update_team_info" on "public"."nova_teams";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.is_nova_challenge_manager()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$begin
  return exists (
    select 1 from public.platform_user_roles
    where (select auth.uid()) = user_id and allow_challenge_management = true
  );
end;$function$
;

CREATE OR REPLACE FUNCTION public.is_nova_role_manager()
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$begin
  return exists (
    select 1 from public.platform_user_roles
    where (select auth.uid()) = user_id and allow_role_management = true
  );
end;$function$
;

CREATE OR REPLACE FUNCTION public.is_nova_user_email_in_team(_user_email text, _team_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$begin
  return exists(
    select 1 
    from public.nova_team_emails
    where _user_email = email 
    and _team_id = team_id
  );
end;$function$
;

create policy "Allow team members to update team info"
on "public"."nova_teams"
as permissive
for update
to authenticated
using ((is_nova_user_id_in_team(auth.uid(), id) OR is_nova_user_email_in_team(auth.email(), id)))
with check ((is_nova_user_id_in_team(auth.uid(), id) OR is_nova_user_email_in_team(auth.email(), id)));