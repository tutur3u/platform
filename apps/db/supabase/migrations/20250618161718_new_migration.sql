alter table "public"."workspace_subscription_products" enable row level security;


create policy "allow view for all products"
on "public"."workspace_subscription_products"
as permissive
for select
to authenticated
using (true);



