alter table "public"."finance_invoice_products"
add column "total_diff" bigint not null default '0'::bigint;
-- rename price_diff to total_diff
alter table "public"."finance_invoices"
    rename column "price_diff" to "total_diff";
alter table "public"."finance_invoices"
alter column "total_diff"
set not null;
alter table "public"."inventory_batches"
add column "total_diff" bigint not null default '0'::bigint;
-- add warehouse_id to public.finance_invoice_products references public.inventory_warehouses
alter table "public"."finance_invoice_products"
add column "warehouse_id" uuid not null;
alter table "public"."finance_invoice_products"
add constraint "finance_invoice_products_warehouse_id_fkey" foreign key ("warehouse_id") references "public"."inventory_warehouses" ("id") on delete restrict on update restrict;
-- make invoice_id, product_id, unit_id, warehouse_id unique
alter table "public"."finance_invoice_products" drop constraint if exists "healthcare_prescription_products_pkey";
alter table "public"."finance_invoice_products"
add constraint "finance_invoice_products_pkey" primary key (
        "invoice_id",
        "product_id",
        "unit_id",
        "warehouse_id"
    );
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.update_inventory_products_from_invoice() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN IF TG_OP = 'INSERT' THEN
UPDATE inventory_products ip
SET amount = ip.amount - NEW.amount
WHERE ip.product_id = NEW.product_id
    AND ip.unit_id = NEW.unit_id
    AND ip.warehouse_id = NEW.warehouse_id;
ELSIF TG_OP = 'UPDATE' THEN
UPDATE inventory_products ip
SET amount = ip.amount - NEW.amount + OLD.amount
WHERE ip.product_id = NEW.product_id
    AND ip.unit_id = NEW.unit_id
    AND ip.warehouse_id = NEW.warehouse_id;
ELSIF TG_OP = 'DELETE' THEN
UPDATE inventory_products ip
SET amount = ip.amount + OLD.amount
WHERE ip.product_id = OLD.product_id
    AND ip.unit_id = OLD.unit_id
    AND ip.warehouse_id = OLD.warehouse_id;
END IF;
RETURN NULL;
END;
$function$;
CREATE TRIGGER update_inventory_products_from_invoice
AFTER
INSERT
    OR DELETE
    OR
UPDATE ON public.finance_invoice_products FOR EACH ROW EXECUTE FUNCTION update_inventory_products_from_invoice();
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.delete_wallet_transaction() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN
DELETE FROM wallet_transactions wt
WHERE wt.id = OLD.transaction_id;
RETURN OLD;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_inventory_products_from_invoice() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN IF TG_OP = 'INSERT' THEN
UPDATE inventory_products ip
SET amount = ip.amount - NEW.amount
WHERE ip.product_id = NEW.product_id
    AND ip.unit_id = NEW.unit_id
    AND ip.warehouse_id = NEW.warehouse_id;
ELSIF TG_OP = 'UPDATE' THEN
UPDATE inventory_products ip
SET amount = ip.amount - NEW.amount + OLD.amount
WHERE ip.product_id = NEW.product_id
    AND ip.unit_id = NEW.unit_id
    AND ip.warehouse_id = NEW.warehouse_id;
ELSIF TG_OP = 'DELETE' THEN
UPDATE inventory_products ip
SET amount = ip.amount + OLD.amount
WHERE ip.product_id = OLD.product_id
    AND ip.unit_id = OLD.unit_id
    AND ip.warehouse_id = OLD.warehouse_id;
END IF;
RETURN NULL;
END;
$function$;
CREATE TRIGGER delete_wallet_transaction
AFTER DELETE ON public.finance_invoices FOR EACH ROW EXECUTE FUNCTION delete_wallet_transaction();