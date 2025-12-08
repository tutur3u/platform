-- Create enum for order status
create type "public"."order_status" as enum (
  'pending',
  'paid',
  'refunded',
  'partially_refunded'
);

-- Create enum for billing reason
create type "public"."billing_reason" as enum (
  'purchase',
  'subscription_create',
  'subscription_cycle',
  'subscription_update'
);

-- Create workspace_orders table to track Polar orders
create table "public"."workspace_orders" (
  "id" uuid not null default gen_random_uuid(),
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone default now(),

  -- Workspace and subscription references
  "ws_id" uuid not null,
  "polar_subscription_id" text,
  "product_id" uuid,

  -- Polar order details
  "polar_order_id" text not null unique,
  "status" order_status not null default 'pending',

  -- Financial amounts (stored in cents as bigint)
  "total_amount" bigint,

  -- Order metadata
  "currency" text default 'usd',
  "billing_reason" billing_reason,

  -- User reference (for quick lookups)
  "user_id" uuid
);

-- Enable RLS
alter table "public"."workspace_orders" enable row level security;

-- Create primary key
create unique index workspace_orders_pkey on public.workspace_orders using btree (id);
alter table "public"."workspace_orders"
  add constraint "workspace_orders_pkey" primary key using index "workspace_orders_pkey";

-- Create foreign key constraints
alter table "public"."workspace_orders"
  add constraint "workspace_orders_ws_id_fkey"
  foreign key (ws_id) references workspaces(id) on delete cascade;

alter table "public"."workspace_orders"
  add constraint "workspace_orders_product_id_fkey"
  foreign key (product_id) references workspace_subscription_products(id) on delete set null;

alter table "public"."workspace_orders"
  add constraint "workspace_orders_polar_subscription_id_fkey"
  foreign key (polar_subscription_id) references workspace_subscriptions(polar_subscription_id) on delete set null;

alter table "public"."workspace_orders"
  add constraint "workspace_orders_user_id_fkey"
  foreign key (user_id) references auth.users(id) on delete set null;

-- Create indexes for common queries
create index workspace_orders_ws_id_idx on public.workspace_orders using btree (ws_id);
create index workspace_orders_polar_subscription_id_idx on public.workspace_orders using btree (polar_subscription_id);
create index workspace_orders_polar_order_id_idx on public.workspace_orders using btree (polar_order_id);
create index workspace_orders_status_idx on public.workspace_orders using btree (status);
create index workspace_orders_user_id_idx on public.workspace_orders using btree (user_id);
create index workspace_orders_created_at_idx on public.workspace_orders using btree (created_at desc);

-- Grant permissions
grant delete on table "public"."workspace_orders" to "anon";
grant insert on table "public"."workspace_orders" to "anon";
grant references on table "public"."workspace_orders" to "anon";
grant select on table "public"."workspace_orders" to "anon";
grant trigger on table "public"."workspace_orders" to "anon";
grant truncate on table "public"."workspace_orders" to "anon";
grant update on table "public"."workspace_orders" to "anon";

grant delete on table "public"."workspace_orders" to "authenticated";
grant insert on table "public"."workspace_orders" to "authenticated";
grant references on table "public"."workspace_orders" to "authenticated";
grant select on table "public"."workspace_orders" to "authenticated";
grant trigger on table "public"."workspace_orders" to "authenticated";
grant truncate on table "public"."workspace_orders" to "authenticated";
grant update on table "public"."workspace_orders" to "authenticated";

grant delete on table "public"."workspace_orders" to "service_role";
grant insert on table "public"."workspace_orders" to "service_role";
grant references on table "public"."workspace_orders" to "service_role";
grant select on table "public"."workspace_orders" to "service_role";
grant trigger on table "public"."workspace_orders" to "service_role";
grant truncate on table "public"."workspace_orders" to "service_role";
grant update on table "public"."workspace_orders" to "service_role";

-- RLS Policies using has_workspace_permission

-- SELECT: Allow users with manage_subscription permission to view orders
create policy "allow users to view orders"
on "public"."workspace_orders"
as permissive
for select
to authenticated
using (
  public.has_workspace_permission(
    ws_id,
    auth.uid(),
    'manage_subscription'
  )
);

-- INSERT: Allow users with manage_subscription permission to create orders
create policy "allow users to create orders"
on "public"."workspace_orders"
as permissive
for insert
to authenticated
with check (
  public.has_workspace_permission(
    ws_id,
    auth.uid(),
    'manage_subscription'
  )
);

-- UPDATE: Allow users with manage_subscription permission to update orders
create policy "allow users to update orders"
on "public"."workspace_orders"
as permissive
for update
to authenticated
using (
  public.has_workspace_permission(
    ws_id,
    auth.uid(),
    'manage_subscription'
  )
)
with check (
  public.has_workspace_permission(
    ws_id,
    auth.uid(),
    'manage_subscription'
  )
);

-- DELETE: Allow users with manage_subscription permission to delete orders
create policy "allow users to delete orders"
on "public"."workspace_orders"
as permissive
for delete
to authenticated
using (
  public.has_workspace_permission(
    ws_id,
    auth.uid(),
    'manage_subscription'
  )
);
