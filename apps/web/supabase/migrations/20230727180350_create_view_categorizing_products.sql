SET check_function_bodies = off;

CREATE OR REPLACE VIEW "public"."categorizing_products_view" AS
SELECT ws.id AS product_id,
  ws.category_id,
  ws.ws_id,
  inv.warehouse_id,
  ws.name AS product_name,
  cate.name AS product_category,
  inv.amount,
  inv.price,
  inv.min_amount
FROM workspace_products ws,
  inventory_products inv,
  product_categories cate
WHERE (
    (ws.id = inv.product_id)
    AND (ws.category_id = cate.id)
  );


CREATE OR REPLACE FUNCTION public.refresh_view() RETURNS SETOF categorizing_products_view LANGUAGE plpgsql AS $function$ BEGIN
SET SCHEMA 'public';

  -- VIEW FOR CATEGORIZING THE PRODUCTS QUANTITY OR NON-QUANTITY
-- DROP VIEW categorizing_products_view;
-- create or replace view categorizing_products_view as 
RETURN query
SELECT WS.id AS product_id,
  WS.category_id,
  WS.ws_id,
  INV.warehouse_id,
  WS.name AS product_name,
  CATE.name AS product_category,
  INV.amount,
  INV.price,
  INV.min_amount
FROM workspace_products AS WS,
  inventory_products AS INV,
  product_categories AS CATE
WHERE WS.id = INV.product_id
  AND WS.category_id = CATE.id;

  -- LATER VIEWS CAN BE IMPEMENTED HERE TO USING THIS REFRESH FUNCTION
END;
$function$;