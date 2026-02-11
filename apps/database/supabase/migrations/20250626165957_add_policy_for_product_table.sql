create policy "only allow admin to insert"
on "public"."workspace_subscription_products"
as permissive
for insert
to authenticated
with check ((EXISTS ( SELECT 1
   FROM workspace_members
  WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.role = ANY (ARRAY['ADMIN'::text, 'OWNER'::text]))))));



