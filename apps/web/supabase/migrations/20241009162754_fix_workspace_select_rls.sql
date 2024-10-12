drop policy "Enable read access for organization members or invited members" on "public"."workspaces";

alter table "public"."workspace_email_invites" add column "invited_by" uuid;

alter table "public"."workspace_email_invites" add constraint "workspace_email_invites_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."workspace_email_invites" validate constraint "workspace_email_invites_invited_by_fkey";

create policy "Enable read access for organization members or invited members"
on "public"."workspaces"
as permissive
for select
to authenticated
using ((is_org_member(auth.uid(), id) OR is_member_invited(auth.uid(), id) OR (EXISTS ( SELECT 1
   FROM workspace_email_invites wei
  WHERE ((lower(wei.email) = lower(auth.email())) AND (wei.ws_id = workspaces.id)))) OR (creator_id = auth.uid())));



