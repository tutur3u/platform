drop policy if exists "Enable insert access for everyone"
on "public"."meet_together_plans";

create policy "Enable insert for authenticated creators"
on "public"."meet_together_plans"
as permissive
for insert
to authenticated
with check ((creator_id = auth.uid()));
