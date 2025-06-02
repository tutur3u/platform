-- Create a trigger when user is deleted from auth.users, set public.users's deleted to true and delete user_id from both public.workspace_members
CREATE OR REPLACE FUNCTION public.on_delete_user() RETURNS trigger AS $$ BEGIN
UPDATE public.users
SET deleted = true
WHERE id = OLD.id;
DELETE FROM public.workspace_members
WHERE user_id = OLD.id;
RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS on_delete_user ON auth.users;
CREATE TRIGGER on_delete_user
AFTER DELETE ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.on_delete_user();