CREATE OR REPLACE FUNCTION public.create_user_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN
INSERT INTO public.users (id)
VALUES (NEW.id);
RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_user_private_details() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN IF (TG_OP = 'INSERT') THEN
INSERT INTO public.user_private_details (user_id, email, new_email)
VALUES (NEW.id, NEW.email, NEW.email_change);
ELSIF (NEW.email_change <> OLD.email_change) THEN
UPDATE public.user_private_details
SET new_email = NEW.email_change
WHERE user_id = NEW.id;
END IF;
RETURN NEW;
END;
$$;
-- Drop the old trigger:
DROP TRIGGER IF EXISTS sync_user_details ON auth.users;
DROP TRIGGER IF EXISTS create_user_profile ON auth.users;
DROP TRIGGER IF EXISTS sync_user_private_details ON auth.users;
-- And create two triggers:
CREATE TRIGGER create_user_profile
AFTER
INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE create_user_profile();
CREATE TRIGGER sync_user_private_details
AFTER
INSERT
    OR
UPDATE ON auth.users FOR EACH ROW EXECUTE PROCEDURE sync_user_private_details();