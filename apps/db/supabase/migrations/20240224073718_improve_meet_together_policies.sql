drop policy "Enable read access for all users if plan is public" on "public"."meet_together_plans";

alter table "public"."meet_together_guest_timeblocks" enable row level security;

alter table "public"."meet_together_user_timeblocks" enable row level security;

create policy "Enable all access for timeblock creators"
on "public"."meet_together_user_timeblocks"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



