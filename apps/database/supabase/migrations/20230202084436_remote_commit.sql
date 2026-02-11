set check_function_bodies = off;
CREATE TRIGGER create_profile_for_new_user_tr BEFORE
INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION create_profile_for_new_user();