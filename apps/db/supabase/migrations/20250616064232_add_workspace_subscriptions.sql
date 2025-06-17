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

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_ws_creator(ws_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$BEGIN
  RETURN (
     (SELECT creator_id FROM public.workspaces WHERE id = ws_id) = auth.uid()

    AND NOT EXISTS (
      SELECT 1 FROM public.workspace_subscription
      WHERE public.workspace_subscription.ws_id = ws_id
    );
  )
END$function$
;

create policy "allow select for users that are in the workspace"
on "public"."workspace_subscription"
as permissive
for select
to authenticated
using ((auth.uid() = ( SELECT workspaces.creator_id
   FROM workspaces
  WHERE (workspaces.id = workspace_subscription.ws_id))));


create policy "only allow owner of the user to buy subscription"
on "public"."workspace_subscription"
as permissive
for select
to public
using ((auth.uid() = ( SELECT workspaces.creator_id
   FROM workspaces
  WHERE (workspaces.id = workspace_subscription.ws_id))));