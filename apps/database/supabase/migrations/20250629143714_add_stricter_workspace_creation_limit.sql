drop policy "Enable insert for authenticated users only" on "public"."workspaces";

alter table "public"."platform_user_roles" add column "allow_workspace_creation" boolean not null default false;

create policy "Enable insert for authenticated users only"
on "public"."workspaces"
as permissive
for insert
to authenticated
with check (((creator_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM platform_user_roles pur
  WHERE ((pur.user_id = auth.uid()) AND (pur.allow_workspace_creation = true))))));



