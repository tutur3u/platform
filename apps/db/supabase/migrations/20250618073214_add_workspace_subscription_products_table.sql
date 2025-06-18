create table "public"."workspace_subscription_products" (
    "id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "name" text,
    "description" text,
    "price" real,
    "recurring_interval" text default 'month'::text
);

alter table "public"."workspace_subscription" add column "product_id" uuid;

CREATE UNIQUE INDEX workspace_subscription_products_pkey ON public.workspace_subscription_products USING btree (id);

alter table "public"."workspace_subscription_products" add constraint "workspace_subscription_products_pkey" PRIMARY KEY using index "workspace_subscription_products_pkey";

alter table "public"."workspace_subscription" add constraint "workspace_subscription_product_id_fkey" FOREIGN KEY (product_id) REFERENCES workspace_subscription_products(id) not valid;

alter table "public"."workspace_subscription" validate constraint "workspace_subscription_product_id_fkey";

grant delete on table "public"."workspace_subscription_products" to "anon";

grant insert on table "public"."workspace_subscription_products" to "anon";

grant references on table "public"."workspace_subscription_products" to "anon";

grant select on table "public"."workspace_subscription_products" to "anon";

grant trigger on table "public"."workspace_subscription_products" to "anon";

grant truncate on table "public"."workspace_subscription_products" to "anon";

grant update on table "public"."workspace_subscription_products" to "anon";

grant delete on table "public"."workspace_subscription_products" to "authenticated";

grant insert on table "public"."workspace_subscription_products" to "authenticated";

grant references on table "public"."workspace_subscription_products" to "authenticated";

grant select on table "public"."workspace_subscription_products" to "authenticated";

grant trigger on table "public"."workspace_subscription_products" to "authenticated";

grant truncate on table "public"."workspace_subscription_products" to "authenticated";

grant update on table "public"."workspace_subscription_products" to "authenticated";

grant delete on table "public"."workspace_subscription_products" to "service_role";

grant insert on table "public"."workspace_subscription_products" to "service_role";

grant references on table "public"."workspace_subscription_products" to "service_role";

grant select on table "public"."workspace_subscription_products" to "service_role";

grant trigger on table "public"."workspace_subscription_products" to "service_role";

grant truncate on table "public"."workspace_subscription_products" to "service_role";

grant update on table "public"."workspace_subscription_products" to "service_role";


