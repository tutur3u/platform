alter table "public"."user_indicators" drop constraint "user_indicators_pkey";

drop index if exists "public"."user_indicators_pkey";

alter table "public"."finance_invoices" add column "paid_amount" bigint not null default '0'::bigint;

alter table "public"."finance_invoices" add column "user_group_id" uuid;

alter table "public"."workspace_products" add column "avatar_url" text;

alter table "public"."workspace_products" add column "creator_id" uuid;

alter table "public"."workspace_products" alter column "category_id" set not null;

alter table "public"."workspace_promotions" add column "creator_id" uuid default auth.uid();

alter table "public"."workspace_user_groups" add column "archived" boolean not null default false;

alter table "public"."workspace_user_groups" add column "ending_date" timestamp with time zone;

alter table "public"."workspace_user_groups" add column "notes" text;

alter table "public"."workspace_user_groups" add column "sessions" date[];

alter table "public"."workspace_user_groups" add column "starting_date" timestamp with time zone;

alter table "public"."workspace_user_groups_users" add column "role" text;

CREATE UNIQUE INDEX user_indicators_pkey ON public.user_indicators USING btree (user_id, indicator_id, group_id);

alter table "public"."user_indicators" add constraint "user_indicators_pkey" PRIMARY KEY using index "user_indicators_pkey";

alter table "public"."finance_invoices" add constraint "public_finance_invoices_user_group_id_fkey" FOREIGN KEY (user_group_id) REFERENCES workspace_user_groups(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."finance_invoices" validate constraint "public_finance_invoices_user_group_id_fkey";

alter table "public"."workspace_products" add constraint "public_workspace_products_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."workspace_products" validate constraint "public_workspace_products_creator_id_fkey";

alter table "public"."workspace_promotions" add constraint "public_workspace_promotions_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."workspace_promotions" validate constraint "public_workspace_promotions_creator_id_fkey";


