DROP FUNCTION IF EXISTS get_inventory_products;
CREATE OR REPLACE FUNCTION get_inventory_products(
        IN _category_ids UUID [] DEFAULT NULL,
        IN _ws_id UUID DEFAULT NULL,
        IN _warehouse_ids UUID [] DEFAULT NULL,
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
    ) AS $$ BEGIN RETURN QUERY WITH inventory_products AS (
        SELECT *
        FROM inventory_products
        WHERE (warehouse_id = ANY(_warehouse_ids))
    )
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
    AND (
        ip.warehouse_id = ANY(_warehouse_ids)
        AND (
            ip.unit_id IS NOT NULL
            OR _has_unit IS FALSE
        )
    )
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
        OR ip.unit_id IS NOT NULL
    )
ORDER BY p.name ASC;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION update_inventory_product_amount() RETURNS TRIGGER AS $$ BEGIN IF (TG_OP = 'INSERT') THEN
UPDATE inventory_products ip
SET amount = ip.amount + NEW.amount
WHERE ip.product_id = NEW.product_id
    AND ip.unit_id = NEW.unit_id
    AND ip.warehouse_id = (
        SELECT warehouse_id
        FROM inventory_batches ib
        WHERE ib.id = NEW.batch_id
    );
ELSIF (TG_OP = 'UPDATE') THEN
UPDATE inventory_products ip
SET amount = ip.amount - OLD.amount + NEW.amount
WHERE ip.product_id = NEW.product_id
    AND ip.unit_id = NEW.unit_id
    AND ip.warehouse_id = (
        SELECT warehouse_id
        FROM inventory_batches ib
        WHERE ib.id = NEW.batch_id
    );
ELSIF (TG_OP = 'DELETE') THEN
UPDATE inventory_products ip
SET amount = ip.amount - OLD.amount
WHERE ip.product_id = OLD.product_id
    AND ip.unit_id = OLD.unit_id
    AND ip.warehouse_id = (
        SELECT warehouse_id
        FROM inventory_batches ib
        WHERE ib.id = OLD.batch_id
    );
END IF;
RETURN NULL;
END;
$$ LANGUAGE plpgsql;
-- Make sure public.inventory_products.amount always >= 0
ALTER TABLE public.inventory_products DROP CONSTRAINT IF EXISTS inventory_products_amount_check;
ALTER TABLE public.inventory_products
ADD CONSTRAINT inventory_products_amount_check CHECK (amount >= 0);
-- Make sure public.inventory_batch_products.amount always >= 0
ALTER TABLE public.inventory_batch_products DROP CONSTRAINT IF EXISTS inventory_batch_products_amount_check;
ALTER TABLE public.inventory_batch_products
ADD CONSTRAINT inventory_batch_products_amount_check CHECK (amount >= 0);