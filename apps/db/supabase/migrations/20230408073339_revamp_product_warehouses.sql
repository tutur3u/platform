alter table "public"."inventory_products" drop constraint "inventory_products_product_id_fkey";
alter table "public"."inventory_products" drop constraint "inventory_products_unit_id_fkey";
alter table "public"."inventory_products" drop constraint "inventory_products_pkey";
drop index if exists "public"."inventory_products_pkey";
alter table "public"."inventory_products"
add column "warehouse_id" uuid not null;
CREATE UNIQUE INDEX inventory_products_pkey ON public.inventory_products USING btree (product_id, unit_id, warehouse_id);
alter table "public"."inventory_products"
add constraint "inventory_products_pkey" PRIMARY KEY using index "inventory_products_pkey";
alter table "public"."inventory_products"
add constraint "inventory_products_warehouse_id_fkey" FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE CASCADE not valid;
alter table "public"."inventory_products" validate constraint "inventory_products_warehouse_id_fkey";
alter table "public"."inventory_products"
add constraint "inventory_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES workspace_products(id) ON DELETE CASCADE not valid;
alter table "public"."inventory_products" validate constraint "inventory_products_product_id_fkey";
alter table "public"."inventory_products"
add constraint "inventory_products_unit_id_fkey" FOREIGN KEY (unit_id) REFERENCES inventory_units(id) ON DELETE CASCADE not valid;
alter table "public"."inventory_products" validate constraint "inventory_products_unit_id_fkey";
set check_function_bodies = off;
DROP FUNCTION IF EXISTS get_inventory_products;
CREATE OR REPLACE FUNCTION get_inventory_products(
    IN _category_ids UUID [] DEFAULT NULL,
    IN _ws_id UUID DEFAULT NULL,
    IN _has_unit BOOLEAN DEFAULT NULL
  ) RETURNS TABLE (
    id UUID,
    name TEXT,
    manufacturer TEXT,
    unit TEXT,
    unit_id UUID,
    category TEXT,
    price BIGINT,
    amount BIGINT,
    ws_id UUID,
    created_at TIMESTAMPTZ
  ) AS $$ BEGIN RETURN QUERY
SELECT p.id,
  p.name,
  p.manufacturer,
  iu.name AS unit,
  ip.unit_id,
  pc.name AS category,
  ip.price,
  COALESCE(ip.amount, 0) AS amount,
  p.ws_id,
  p.created_at
FROM workspace_products p
  LEFT JOIN inventory_products ip ON ip.product_id = p.id
  LEFT JOIN inventory_units iu ON ip.unit_id = iu.id
  LEFT JOIN product_categories pc ON p.category_id = pc.id
WHERE (
    _category_ids IS NULL
    OR p.category_id = ANY(_category_ids)
  )
  AND (
    _ws_id IS NULL
    OR p.ws_id = _ws_id
  )
  AND (
    _has_unit IS NULL
    OR (
      _has_unit = TRUE
      AND ip.unit_id IS NOT NULL
    )
  )
ORDER BY p.name ASC;
END;
$$ LANGUAGE plpgsql;
alter table "public"."wallet_transactions" drop column "is_expense";
alter table "public"."inventory_products"
add column "min_amount" bigint not null default '0'::bigint;