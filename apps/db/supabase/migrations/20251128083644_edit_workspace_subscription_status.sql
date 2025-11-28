alter type "public"."subscription_status" rename to "subscription_status_old";
create type "public"."subscription_status" as enum ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid');
alter table "public"."workspace_subscription" alter column "status" type "public"."subscription_status" using "status"::text::"public"."subscription_status";
drop type "public"."subscription_status_old";