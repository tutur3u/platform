alter table "public"."workspace_products"
add column "archived" boolean not null default false;

create index if not exists "workspace_products_ws_id_archived_created_at_idx"
on "public"."workspace_products" using btree ("ws_id", "archived", "created_at" desc);
