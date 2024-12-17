CREATE OR REPLACE VIEW workspace_user_groups_with_amount AS
SELECT workspace_user_groups.*,
    count(workspace_user_groups_users.*) AS amount
FROM workspace_user_groups
    LEFT JOIN workspace_user_groups_users ON workspace_user_groups_users.group_id = workspace_user_groups.id
GROUP BY workspace_user_groups.id;
alter table "public"."finance_invoice_products" drop constraint "finance_invoice_products_invoice_id_fkey";
alter table "public"."finance_invoice_products" drop constraint "finance_invoice_products_product_id_fkey";
alter table "public"."finance_invoice_products" drop constraint "finance_invoice_products_unit_id_fkey";
alter table "public"."finance_invoice_promotions" drop constraint "finance_invoice_promotions_invoice_id_fkey";
alter table "public"."finance_invoice_promotions" drop constraint "finance_invoice_promotions_promo_id_fkey";
alter table "public"."finance_invoice_products"
add constraint "finance_invoice_products_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES finance_invoices(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."finance_invoice_products" validate constraint "finance_invoice_products_invoice_id_fkey";
alter table "public"."finance_invoice_products"
add constraint "finance_invoice_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES workspace_products(id) ON UPDATE CASCADE ON DELETE
SET DEFAULT not valid;
alter table "public"."finance_invoice_products" validate constraint "finance_invoice_products_product_id_fkey";
alter table "public"."finance_invoice_products"
add constraint "finance_invoice_products_unit_id_fkey" FOREIGN KEY (unit_id) REFERENCES inventory_units(id) ON UPDATE CASCADE ON DELETE
SET DEFAULT not valid;
alter table "public"."finance_invoice_products" validate constraint "finance_invoice_products_unit_id_fkey";
alter table "public"."finance_invoice_promotions"
add constraint "finance_invoice_promotions_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES finance_invoices(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."finance_invoice_promotions" validate constraint "finance_invoice_promotions_invoice_id_fkey";
alter table "public"."finance_invoice_promotions"
add constraint "finance_invoice_promotions_promo_id_fkey" FOREIGN KEY (promo_id) REFERENCES workspace_promotions(id) ON UPDATE CASCADE ON DELETE
SET DEFAULT not valid;
alter table "public"."finance_invoice_promotions" validate constraint "finance_invoice_promotions_promo_id_fkey";