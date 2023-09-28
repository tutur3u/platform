BEGIN;
ALTER TABLE finance_invoice_products DROP CONSTRAINT IF EXISTS finance_invoice_products_pkey;
CREATE UNIQUE INDEX finance_invoice_products_pkey ON public.finance_invoice_products (invoice_id, product_id, unit_id, warehouse_id);
ALTER TABLE finance_invoice_products
ADD PRIMARY KEY USING INDEX finance_invoice_products_pkey;
COMMIT;