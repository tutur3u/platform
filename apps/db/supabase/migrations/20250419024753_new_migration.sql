alter table "public"."nova_roles" add column "allow_manage_all_challenges" boolean not null default false;

alter table "public"."nova_roles" add column "manageable_challenge_ids" uuid[] not null default '{}'::uuid[];

-- Rename whitelisted_only column to restricted_access
alter table "public"."nova_challenges" rename column "whitelisted_only" to "restricted_access";