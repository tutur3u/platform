alter table "auth"."refresh_tokens" drop constraint "refresh_tokens_parent_fkey";

alter table "auth"."sessions" add column "not_after" timestamp with time zone;

CREATE TRIGGER create_profile_for_new_user_tr BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION create_profile_for_new_user();


create policy "Enable insert for authenticated users only"
on "storage"."buckets"
as permissive
for insert
to authenticated
with check (true);


create policy "Enable insert for authenticated users only"
on "storage"."objects"
as permissive
for insert
to authenticated
with check (true);



