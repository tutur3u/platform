drop policy "Allow team members to insert shortened links" on "public"."shortened_links";

drop policy "Allow team members to select shortened links" on "public"."shortened_links";

-- First add the column without NOT NULL constraint
alter table "public"."shortened_links" add column "ws_id" uuid;

-- Update all legacy shortened links to have a ws_id of the default workspace
update shortened_links set ws_id = '00000000-0000-0000-0000-000000000000' where ws_id is null;

-- Now add the NOT NULL constraint
alter table "public"."shortened_links" alter column "ws_id" set not null;

alter table "public"."shortened_links" alter column "creator_id" set not null;

alter table "public"."shortened_links" alter column "domain" set not null;

alter table "public"."shortened_links" add constraint "shortened_links_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."shortened_links" validate constraint "shortened_links_ws_id_fkey";

create policy "Allow team members to insert"
on "public"."shortened_links"
as permissive
for insert
to authenticated
with check ((EXISTS ( SELECT 1
   FROM auth.users
  WHERE ((users.id = auth.uid()) AND ((users.email)::text ~~ '%@tuturuuu.com'::text)))));


create policy "Allow team members to select"
on "public"."shortened_links"
as permissive
for select
to authenticated
using ((EXISTS ( SELECT 1
   FROM auth.users
  WHERE ((users.id = auth.uid()) AND ((users.email)::text ~~ '%@tuturuuu.com'::text)))));


create policy "Allow workspace members to insert"
on "public"."shortened_links"
as permissive
for insert
to public
with check (is_org_member(auth.uid(), ws_id));


create policy "Allow workspace members to select"
on "public"."shortened_links"
as permissive
for select
to authenticated
using (is_org_member(auth.uid(), ws_id));



