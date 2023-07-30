drop view if exists "public"."categorizing_products_view";

alter table "public"."inventory_products" add column "amount_before_categorizing" bigint;

alter table "public"."inventory_products" alter column "amount" drop not null;

alter table "public"."product_categories" add column "type" text default 'quantity'::text;

alter table "public"."product_categories" add constraint "product_categories_type_check" CHECK ((type = ANY (ARRAY['quantity'::text, 'non-quantity'::text]))) not valid;

alter table "public"."product_categories" validate constraint "product_categories_type_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.categorizing_the_new_product()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ 
DECLARE
  var_inventory_productId uuid;
  var_category_type text;
  var_amount int8;
BEGIN 
  SELECT 
    product_id, 
    amount, 
    category_type
  INTO 
    var_inventory_productId,
    var_amount,
    var_category_type
  FROM categorizing_products_view
  WHERE category_id = NEW.product_id;

  IF var_category_type = 'non-quantity' THEN 
    UPDATE inventory_products 
    SET amount = NULL
    WHERE product_id = var_inventory_productId;

    UPDATE inventory_products
    SET amount_before_categorizing = var_amount
    WHERE product_id = var_inventory_productId;
   
  ELSIF var_category_type = 'quantity' THEN 
    UPDATE inventory_products 
    SET amount = 0
    WHERE product_id = var_inventory_productId;

    UPDATE inventory_products
    SET amount_before_categorizing = var_amount
    WHERE product_id = var_inventory_productId;
  END IF;  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.categorizing_the_products()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ 
DECLARE
  var_inventory_productId uuid;
  var_category_type text;
  var_amount int8;
BEGIN 
  SELECT 
    product_id, 
    amount, 
    category_type
  INTO 
    var_inventory_productId,
    var_amount,
    var_category_type
    
  FROM categorizing_products_view
  WHERE category_id = NEW.id;

  IF NEW.type = 'non-quantity' THEN 
    UPDATE inventory_products 
    SET amount = NULL
    WHERE product_id = var_inventory_productId;

    UPDATE inventory_products
    SET amount_before_categorizing = var_amount
    WHERE product_id = var_inventory_productId;
   
  ELSIF NEW.type = 'quantity' THEN 
    UPDATE inventory_products 
    SET amount = 0
    WHERE product_id = var_inventory_productId;

    UPDATE inventory_products
    SET amount_before_categorizing = var_amount
    WHERE product_id = var_inventory_productId;
  END IF;  
  RETURN NEW;
END;
$function$
;

create or replace view "public"."categorizing_products_view" as  SELECT ws.id AS product_id,
    ws.category_id,
    ws.ws_id,
    inv.warehouse_id,
    ws.name AS product_name,
    cate.name AS product_category,
    cate.type AS category_type,
    inv.amount,
    inv.amount_before_categorizing,
    inv.price,
    inv.min_amount
   FROM workspace_products ws,
    inventory_products inv,
    product_categories cate
  WHERE ((ws.id = inv.product_id) AND (ws.category_id = cate.id));


CREATE OR REPLACE FUNCTION public.refresh_view()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  SET schema 'public';

  -- VIEW FOR CATEGORIZING THE PRODUCTS QUANTITY OR NON-QUANTITY
  DROP VIEW categorizing_products_view;
  -- return query
  create or replace view categorizing_products_view WITH (security_invoker) as 
    select  WS.id as product_id, WS.category_id,  WS.ws_id, INV.warehouse_id, WS.name as product_name, 
    CATE.name as product_category, CATE.type as category_type, INV.amount, INV.amount_before_categorizing, INV.price, INV.min_amount  from workspace_products
    as WS, inventory_products as INV, product_categories as CATE
    where WS.id = INV.product_id and WS.category_id = CATE.id;
  
  return;

  -- LATER VIEWS CAN BE IMPEMENTED HERE TO USING THIS REFRESH FUNCTION
END;
$function$
;

CREATE TRIGGER categorizing_products_trigger AFTER UPDATE ON public.product_categories FOR EACH ROW EXECUTE FUNCTION categorizing_the_products();


