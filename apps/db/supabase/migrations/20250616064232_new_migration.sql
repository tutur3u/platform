create type "public"."subscription_status" as enum ('trialing', 'active', 'canceled', 'past_due');

create table "public"."workspace_subscription" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "ws_id" uuid default gen_random_uuid(),
    "status" subscription_status,
    "polar_subscription_id" text not null,
    "product_id" uuid default gen_random_uuid(),
    "price_id" uuid default gen_random_uuid(),
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean default false,
    "updated_at" timestamp with time zone default now()
);


alter table "public"."workspace_subscription" enable row level security;

CREATE UNIQUE INDEX workspace_subscription_pkey ON public.workspace_subscription USING btree (id, polar_subscription_id);

alter table "public"."workspace_subscription" add constraint "workspace_subscription_pkey" PRIMARY KEY using index "workspace_subscription_pkey";

alter table "public"."workspace_subscription" add constraint "workspace_subscription_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE not valid;

alter table "public"."workspace_subscription" validate constraint "workspace_subscription_ws_id_fkey";

grant delete on table "public"."workspace_subscription" to "anon";

grant insert on table "public"."workspace_subscription" to "anon";

grant references on table "public"."workspace_subscription" to "anon";

grant select on table "public"."workspace_subscription" to "anon";

grant trigger on table "public"."workspace_subscription" to "anon";

grant truncate on table "public"."workspace_subscription" to "anon";

grant update on table "public"."workspace_subscription" to "anon";

grant delete on table "public"."workspace_subscription" to "authenticated";

grant insert on table "public"."workspace_subscription" to "authenticated";

grant references on table "public"."workspace_subscription" to "authenticated";

grant select on table "public"."workspace_subscription" to "authenticated";

grant trigger on table "public"."workspace_subscription" to "authenticated";

grant truncate on table "public"."workspace_subscription" to "authenticated";

grant update on table "public"."workspace_subscription" to "authenticated";

grant delete on table "public"."workspace_subscription" to "service_role";

grant insert on table "public"."workspace_subscription" to "service_role";

grant references on table "public"."workspace_subscription" to "service_role";

grant select on table "public"."workspace_subscription" to "service_role";

grant trigger on table "public"."workspace_subscription" to "service_role";

grant truncate on table "public"."workspace_subscription" to "service_role";

grant update on table "public"."workspace_subscription" to "service_role";


