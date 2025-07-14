-- Add workspace support to meet_together_plans table
alter table "public"."meet_together_plans" add column "ws_id" uuid;

-- Add foreign key constraint to link to workspaces table
alter table "public"."meet_together_plans" add constraint "meet_together_plans_ws_id_fkey" 
FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."meet_together_plans" validate constraint "meet_together_plans_ws_id_fkey";

-- Update RLS policies to include workspace context
drop policy if exists "Allow all if the user is the creator" on "public"."meet_together_plans";
drop policy if exists "Enable read access for all users if plan is public" on "public"."meet_together_plans";

-- New policy: Allow all operations if the user is the creator and workspace member (or no workspace)
create policy "Allow all if the user is the creator and workspace member"
on "public"."meet_together_plans"
as permissive
for all
to authenticated
using ((creator_id = auth.uid()) AND (ws_id IS NULL OR is_org_member(auth.uid(), ws_id)))
with check ((creator_id = auth.uid()) AND (ws_id IS NULL OR is_org_member(auth.uid(), ws_id)));

-- New policy: Enable read access for workspace members if plan is public (or no workspace)
create policy "Enable read access for workspace members if plan is public"
on "public"."meet_together_plans"
as permissive
for select
to authenticated
using (is_public AND (ws_id IS NULL OR is_org_member(auth.uid(), ws_id)));

-- New policy: Enable read access for everyone if plan is public
create policy "Enable read access for everyone if plan is public"
on "public"."meet_together_plans"
as permissive
for select
to public
using ((is_public AND (ws_id IS NULL))); 