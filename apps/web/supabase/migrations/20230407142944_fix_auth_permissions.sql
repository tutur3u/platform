DROP TRIGGER IF EXISTS auth_users_update_trigger ON auth.users;
DROP FUNCTION IF EXISTS update_public_users_email();
CREATE OR REPLACE FUNCTION update_public_users_email() RETURNS TRIGGER AS $$ BEGIN
UPDATE public.users
SET email = NEW.email
WHERE public.users.id = NEW.id;
RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER auth_users_update_trigger
AFTER
UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION update_public_users_email();
