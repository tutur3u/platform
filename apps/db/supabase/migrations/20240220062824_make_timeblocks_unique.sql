drop policy "Enable insert access for everyone" on "public"."meet_together_plans";
alter table "public"."meet_together_guest_timeblocks" disable row level security;
alter table "public"."meet_together_user_timeblocks" disable row level security;
-- make sure public.meet_together_guest_timeblocks and public.meet_together_user_timeblocks have unique (plan_id, user_id, date, start_time, end_time)
alter table "public"."meet_together_guest_timeblocks"
add constraint "meet_together_guest_timeblocks_combination_unique" unique (
        "plan_id",
        "user_id",
        "date",
        "start_time",
        "end_time"
    );
alter table "public"."meet_together_user_timeblocks"
add constraint "meet_together_user_timeblocks_combination_unique" unique (
        "plan_id",
        "user_id",
        "date",
        "start_time",
        "end_time"
    );