set check_function_bodies = off;
CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $function$
select coalesce(
		nullif(
			current_setting('request.jwt.claim.email', true),
			''
		),
		(
			nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email'
		)
	)::text $function$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $function$
select coalesce(
		nullif(
			current_setting('request.jwt.claim.role', true),
			''
		),
		(
			nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role'
		)
	)::text $function$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $function$
select coalesce(
		nullif(
			current_setting('request.jwt.claim.sub', true),
			''
		),
		(
			nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub'
		)
	)::uuid $function$;
CREATE TRIGGER create_profile_for_new_user_tr BEFORE
INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION create_profile_for_new_user();
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text LANGUAGE plpgsql AS $function$
DECLARE _parts text [];
_filename text;
BEGIN
select string_to_array(name, '/') into _parts;
select _parts [array_length(_parts,1)] into _filename;
-- @todo return the last part instead of 2
return split_part(_filename, '.', 2);
END $function$;
CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text LANGUAGE plpgsql AS $function$
DECLARE _parts text [];
BEGIN
select string_to_array(name, '/') into _parts;
return _parts [array_length(_parts,1)];
END $function$;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text [] LANGUAGE plpgsql AS $function$
DECLARE _parts text [];
BEGIN
select string_to_array(name, '/') into _parts;
return _parts [1:array_length(_parts,1)-1];
END $function$;