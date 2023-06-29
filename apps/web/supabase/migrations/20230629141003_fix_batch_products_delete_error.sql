alter table "public"."inventory_batch_products" drop constraint "inventory_batch_products_batch_id_fkey";

alter table "public"."inventory_batch_products" drop constraint "inventory_batch_products_product_id_fkey";

alter table "public"."inventory_batch_products" drop constraint "inventory_batch_products_unit_id_fkey";

alter table "public"."inventory_batch_products" add constraint "inventory_batch_products_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_batch_products" validate constraint "inventory_batch_products_batch_id_fkey";

alter table "public"."inventory_batch_products" add constraint "inventory_batch_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES workspace_products(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_batch_products" validate constraint "inventory_batch_products_product_id_fkey";

alter table "public"."inventory_batch_products" add constraint "inventory_batch_products_unit_id_fkey" FOREIGN KEY (unit_id) REFERENCES inventory_units(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_batch_products" validate constraint "inventory_batch_products_unit_id_fkey";


