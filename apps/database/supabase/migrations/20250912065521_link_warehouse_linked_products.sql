alter table "public"."user_group_linked_products" drop constraint "user_group_linked_products_pkey";

drop index if exists "public"."user_group_linked_products_pkey";

alter table "public"."user_group_linked_products" add column "warehouse_id" uuid;

alter table "public"."user_group_linked_products" add constraint "user_group_linked_products_warehouse_id_fkey" FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."user_group_linked_products" validate constraint "user_group_linked_products_warehouse_id_fkey";


