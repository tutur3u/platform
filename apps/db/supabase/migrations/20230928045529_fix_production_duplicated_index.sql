BEGIN;
-- Add warehouse field to finance_invoice_products table, default to empty string
ALTER TABLE finance_invoice_products
ADD COLUMN IF NOT EXISTS warehouse TEXT NOT NULL DEFAULT '';
-- Populate warehouse field by taking value from inventory_warehouses.name
UPDATE finance_invoice_products
SET warehouse = inventory_warehouses.name
FROM inventory_warehouses
WHERE finance_invoice_products.warehouse = ''
    AND finance_invoice_products.warehouse_id = inventory_warehouses.id;
-- Create a trigger to insert, update, delete warehouse field in finance_invoice_products table
CREATE OR REPLACE FUNCTION update_invoice_products_warehouse() RETURNS TRIGGER AS $$ BEGIN IF (
        TG_OP = 'INSERT'
        OR TG_OP = 'UPDATE'
    ) THEN NEW.warehouse = COALESCE(
        (
            SELECT name
            FROM inventory_warehouses
            WHERE id = NEW.warehouse_id
        ),
        OLD.warehouse
    );
RETURN NEW;
ELSIF (TG_OP = 'DELETE') THEN RETURN OLD;
END IF;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS update_invoice_products_warehouse ON finance_invoice_products;
CREATE TRIGGER update_invoice_products_warehouse BEFORE
INSERT
    OR
UPDATE
    OR DELETE ON finance_invoice_products FOR EACH ROW EXECUTE PROCEDURE update_invoice_products_warehouse();
-- Add unique constraint to finance_invoice_products table
ALTER TABLE finance_invoice_products DROP CONSTRAINT IF EXISTS finance_invoice_products_pkey;
alter table "public"."finance_invoice_products" drop constraint "finance_invoice_products_warehouse_id_fkey";
alter table "public"."finance_invoice_products"
add constraint "finance_invoice_products_warehouse_id_fkey" FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON UPDATE CASCADE ON DELETE
SET DEFAULT not valid;
alter table "public"."finance_invoice_products" validate constraint "finance_invoice_products_warehouse_id_fkey";
CREATE UNIQUE INDEX finance_invoice_products_pkey ON public.finance_invoice_products USING btree (
    invoice_id,
    product_name,
    product_unit,
    warehouse
);
ALTER TABLE finance_invoice_products
ADD PRIMARY KEY USING INDEX finance_invoice_products_pkey;
COMMIT;