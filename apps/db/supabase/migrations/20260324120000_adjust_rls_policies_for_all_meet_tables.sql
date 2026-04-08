drop policy if exists "Allow all if the user is the creator"
on "public"."meet_together_plans";

drop policy if exists "Enable insert access for everyone"
on "public"."meet_together_plans";

create policy "Allow all if the user is the creator"
on "public"."meet_together_plans"
for all
to public
using (creator_id = auth.uid());

create policy "Enable read access for everyone if plan is public"
on "public"."meet_together_plans"
for select
to public
using (is_public);