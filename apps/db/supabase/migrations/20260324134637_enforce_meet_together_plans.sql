delete from "public"."meet_together_plans" where creator_id is null;
alter table "public"."meet_together_plans" alter column creator_id set not null;

delete from "public"."meet_together_plans" where created_at is null;
alter table "public"."meet_together_plans" alter column created_at set not null;