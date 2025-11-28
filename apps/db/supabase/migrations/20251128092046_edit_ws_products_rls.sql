create policy "Allow platform admins to update products"
on "public"."workspace_subscription_products"
as permissive
for update
to authenticated
using (
    has_workspace_permission('00000000-0000-0000-0000-000000000000'::uuid, auth.uid(), 'manage_workspace_roles'::text)
)
with check (
    has_workspace_permission('00000000-0000-0000-0000-000000000000'::uuid, auth.uid(), 'manage_workspace_roles'::text)
);
