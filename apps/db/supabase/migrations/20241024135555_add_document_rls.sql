alter table "public"."workspace_documents" enable row level security;

create policy "Allow all access for workspace member"
on "public"."workspace_documents"
as permissive
for all
to authenticated
using (is_org_member(auth.uid(), ws_id))
with check (is_org_member(auth.uid(), ws_id));



