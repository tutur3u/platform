create policy "Allow insert if user has no more than 10 plans"
on "public"."meet_together_plans"
as restrictive
for insert
to public
with check (creator_id = auth.uid() and (select count(*) from "public"."meet_together_plans" where creator_id = auth.uid()) < 10);