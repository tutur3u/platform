alter table "public"."meet_together_plans" add column "enable_to_edit" boolean not null default true;

alter table "public"."meet_together_plans" add column "is_confirm" boolean not null default false;


