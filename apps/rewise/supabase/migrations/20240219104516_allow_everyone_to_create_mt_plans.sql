create policy "Enable insert access for everyone"
on "public"."meet_together_plans"
as permissive
for insert
to public
with check (true);



