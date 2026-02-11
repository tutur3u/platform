alter table "public"."workspace_products" drop constraint "workspace_products_category_id_fkey";

alter table "public"."workspace_products" alter column "category_id" drop not null;

alter table "public"."workspace_products" add constraint "workspace_products_category_id_fkey" FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET DEFAULT not valid;

alter table "public"."workspace_products" validate constraint "workspace_products_category_id_fkey";


