drop trigger if exists "categorizing_products_trigger" on "public"."product_categories";

alter table "public"."inventory_products" drop constraint "inventory_products_amount_check";

drop function if exists "public"."categorizing_the_new_product"();

drop view if exists "public"."categorizing_products_view";

alter table "public"."inventory_products" drop column "amount_before_categorizing";

alter table "public"."inventory_products" add column "infinity_amount_recover" bigint not null default '0'::bigint;

set check_function_bodies = off;

create or replace view "public"."categorizing_products_view" as  SELECT ws.id AS product_id,
    ws.category_id,
    ws.ws_id,
    inv.warehouse_id,
    ws.name AS product_name,
    cate.name AS product_category,
    cate.type AS category_type,
    inv.amount,
    inv.infinity_amount_recover,
    inv.price,
    inv.min_amount
   FROM workspace_products ws,
    inventory_products inv,
    product_categories cate
  WHERE ((ws.id = inv.product_id) AND (ws.category_id = cate.id));


CREATE OR REPLACE FUNCTION public.categorizing_the_products()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  var_inventory_productId uuid;
  var_category_type text;
  var_amount integer;

BEGIN
  IF TG_OP = 'UPDATE' THEN 
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

    IF NEW.type = 'non-quantity'THEN
      UPDATE inventory_products  
      SET amount = NULL
      WHERE product_id in (SELECT product_id FROM categorizing_products_view WHERE category_type = NEW.type);

    ELSIF NEW.type = 'quantity' THEN
      UPDATE inventory_products
      SET amount = 0
      WHERE product_id in (SELECT product_id FROM categorizing_products_view WHERE category_type = NEW.type);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

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
    CATE.name as product_category, CATE.type as category_type, INV.amount, INV.price, INV.min_amount  from workspace_products
    as WS, inventory_products as INV, product_categories as CATE
    where WS.id = INV.product_id and WS.category_id = CATE.id;
  
  return;

  -- LATER VIEWS CAN BE IMPEMENTED HERE TO USING THIS REFRESH FUNCTION
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_inventory_product_amount()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ 
DECLARE
  var_category_type text;
BEGIN 

IF (TG_OP = 'INSERT') THEN
  SELECT
    category_type
  INTO
    var_category_type
  FROM categorizing_products_view
  WHERE product_id = NEW.product_id;


  IF (var_category_type = 'quantity') THEN
    UPDATE inventory_products ip
    SET amount = ip.amount + NEW.amount
    WHERE ip.product_id = NEW.product_id AND ip.unit_id = NEW.unit_id;
  ELSE
    UPDATE inventory_products ip
    SET infinity_amount_recover = ip.infinity_amount_recover + NEW.amount
    WHERE ip.product_id = NEW.product_id AND ip.unit_id = NEW.unit_id;
  END IF;

ELSIF (TG_OP = 'UPDATE') THEN
  
  IF (var_category_type = 'quantity') THEN       
    UPDATE inventory_products ip
    SET amount = ip.amount - OLD.amount + NEW.amount + -1 * sign(infinity_amount_recover)
    WHERE ip.product_id = NEW.product_id AND ip.unit_id = NEW.unit_id;

    UPDATE inventory_products ip
    SET infinity_amount_recover = 0
    WHERE ip.product_id = NEW.product_id AND ip.unit_id = NEW.unit_id;
  ELSE 
    UPDATE inventory_products ip
    SET infinity_amount_recover = ip.infinity_amount_recover - OLD.amount + NEW.amount
    WHERE ip.product_id = NEW.product_id AND ip.unit_id = NEW.unit_id;
  END IF;

ELSIF (TG_OP = 'DELETE') THEN
  UPDATE inventory_products ip
  SET amount = ip.amount - OLD.amount
  WHERE ip.product_id = OLD.product_id AND ip.unit_id = OLD.unit_id;

  UPDATE inventory_products ip
  SET infinity_amount_recover = 0
  WHERE ip.product_id = OLD.product_id AND ip.unit_id = OLD.unit_id;
END IF;
RETURN NULL;
END;
$function$
;

CREATE TRIGGER categorizing_products_trigger AFTER INSERT OR UPDATE ON public.product_categories FOR EACH ROW EXECUTE FUNCTION categorizing_the_products();


