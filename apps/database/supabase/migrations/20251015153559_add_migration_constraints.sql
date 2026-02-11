-- Migration: Add missing primary key constraints and unique indexes for proper deduplication
-- This prevents duplicate records during external data migrations

-- ============================================================================
-- 1. user_group_linked_products - Add unique constraint for group+product+unit combination
-- ============================================================================
-- This table currently has no primary key, causing duplicates during migration
-- The natural unique identifier is the combination of group_id, product_id, and unit_id

DO $$ 
BEGIN
  -- Check if constraint already exists before adding
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_group_linked_products_unique_combo'
  ) THEN
    -- First, remove any existing duplicates before adding the constraint
    DELETE FROM user_group_linked_products a
    USING user_group_linked_products b
    WHERE a.ctid < b.ctid
      AND a.group_id = b.group_id
      AND a.product_id = b.product_id
      AND a.unit_id = b.unit_id;
    
    -- Add unique constraint
    ALTER TABLE user_group_linked_products
    ADD CONSTRAINT user_group_linked_products_unique_combo
    UNIQUE (group_id, product_id, unit_id);
  END IF;
END $$;

-- ============================================================================
-- 2. finance_invoice_promotions - Make invoice_id NOT NULL and add unique constraint
-- ============================================================================
-- This table has no primary key, causing massive duplicates during migration
-- The natural unique identifier is invoice_id + code combination
-- (same invoice can have multiple promotions, but same code shouldn't appear twice)

DO $$
BEGIN
  -- Check if the finance_invoice_promotions table exists before proceeding
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'finance_invoice_promotions'
  ) THEN
    -- Step 1: Remove any records with NULL invoice_id or NULL code (orphaned/invalid data)
    DELETE FROM finance_invoice_promotions
    WHERE invoice_id IS NULL OR code IS NULL;

    -- Step 2: Remove duplicates: keep one row per invoice_id + code combination
    -- Using ctid ensures we always keep exactly one row, even if created_at values are identical or NULL
    DELETE FROM finance_invoice_promotions a
    USING finance_invoice_promotions b
    WHERE a.ctid < b.ctid
      AND a.invoice_id = b.invoice_id
      AND a.code = b.code;

    -- Step 3: Drop legacy standalone index only if NOT owned by a constraint
    IF EXISTS (
      SELECT 1
      FROM pg_class idx
      JOIN pg_namespace n ON n.oid = idx.relnamespace
      LEFT JOIN pg_constraint con ON con.conindid = idx.oid
      WHERE n.nspname = 'public'
        AND idx.relkind = 'i'
        AND idx.relname = 'finance_invoice_promotions_unique_combo'
        AND con.oid IS NULL
    ) THEN
      DROP INDEX IF EXISTS public.finance_invoice_promotions_unique_combo;
    END IF;

    -- Step 4: Make invoice_id NOT NULL (if not already)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'finance_invoice_promotions'
        AND column_name = 'invoice_id'
        AND is_nullable = 'YES'
    ) THEN
      ALTER TABLE finance_invoice_promotions
      ALTER COLUMN invoice_id SET NOT NULL;
    END IF;

    -- Step 5: Add unique constraint (not partial index)
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'finance_invoice_promotions_unique_combo'
    ) THEN
      ALTER TABLE finance_invoice_promotions
      ADD CONSTRAINT finance_invoice_promotions_unique_combo
      UNIQUE (invoice_id, code);
    END IF;
  END IF;
END $$;

