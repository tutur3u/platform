-- Promotion usage limits + usage tracking
--
-- Adds global usage limit support for workspace promotions:
-- - max_uses: NULL = unlimited
-- - current_uses: current usage count (backfilled from existing invoices)

ALTER TABLE workspace_promotions
ADD COLUMN IF NOT EXISTS max_uses integer DEFAULT NULL;

ALTER TABLE workspace_promotions
ADD COLUMN IF NOT EXISTS current_uses integer NOT NULL DEFAULT 0;

-- Guardrails
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_promotions_max_uses_non_negative'
  ) THEN
    ALTER TABLE workspace_promotions
    ADD CONSTRAINT workspace_promotions_max_uses_non_negative
    CHECK (max_uses IS NULL OR max_uses >= 0) NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_promotions_current_uses_non_negative'
  ) THEN
    ALTER TABLE workspace_promotions
    ADD CONSTRAINT workspace_promotions_current_uses_non_negative
    CHECK (current_uses >= 0) NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_promotions_max_uses_non_negative'
  ) THEN
    ALTER TABLE workspace_promotions
    VALIDATE CONSTRAINT workspace_promotions_max_uses_non_negative;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_promotions_current_uses_non_negative'
  ) THEN
    ALTER TABLE workspace_promotions
    VALIDATE CONSTRAINT workspace_promotions_current_uses_non_negative;
  END IF;
END;
$$;

-- Backfill current_uses from existing invoice promotions
UPDATE workspace_promotions wp
SET current_uses = src.cnt
FROM (
  SELECT promo_id, COUNT(*)::integer AS cnt
  FROM finance_invoice_promotions
  WHERE promo_id IS NOT NULL
  GROUP BY promo_id
) src
WHERE wp.id = src.promo_id;

-- Increment current_uses when a promotion is applied to an invoice.
-- Also enforces max_uses at the database level to avoid race conditions.
CREATE OR REPLACE FUNCTION increment_promotion_uses()
RETURNS TRIGGER AS $$
DECLARE
  v_max_uses integer;
  v_current_uses integer;
BEGIN
  IF NEW.promo_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT max_uses, current_uses
  INTO v_max_uses, v_current_uses
  FROM workspace_promotions
  WHERE id = NEW.promo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Promotion record missing; allow invoice promotion insert but do not count.
    RETURN NEW;
  END IF;

  IF v_max_uses IS NOT NULL AND v_current_uses >= v_max_uses THEN
    -- 23514 = check_violation
    RAISE EXCEPTION 'Promotion usage limit reached'
      USING ERRCODE = '23514';
  END IF;

  UPDATE workspace_promotions
  SET current_uses = current_uses + 1
  WHERE id = NEW.promo_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_promotion_uses ON finance_invoice_promotions;
CREATE TRIGGER trg_increment_promotion_uses
AFTER INSERT ON finance_invoice_promotions
FOR EACH ROW
EXECUTE FUNCTION increment_promotion_uses();
