alter table "public"."workspace_users"
add column "balance" bigint default '0'::bigint;
-- Create a function to calculate count of all products in a specific workspace
CREATE OR REPLACE FUNCTION public.get_workspace_products_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.workspace_products
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all product and unit combinations in a specific workspace
CREATE OR REPLACE FUNCTION public.get_inventory_products_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.inventory_products
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all product categories in a specific inventory
CREATE OR REPLACE FUNCTION public.get_inventory_product_categories_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.product_categories
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all warehouses in a specific inventory
CREATE OR REPLACE FUNCTION public.get_inventory_warehouses_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.inventory_warehouses
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all units in a specific inventory
CREATE OR REPLACE FUNCTION public.get_inventory_units_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.inventory_units
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all suppliers in a specific inventory
CREATE OR REPLACE FUNCTION public.get_inventory_suppliers_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.inventory_suppliers
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all batches in a specific inventory, linked via warehouse_id
CREATE OR REPLACE FUNCTION public.get_inventory_batches_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.inventory_batches wb
    INNER JOIN public.inventory_warehouses ww ON wb.warehouse_id = ww.id
WHERE ww.ws_id = $1 $$ LANGUAGE SQL;