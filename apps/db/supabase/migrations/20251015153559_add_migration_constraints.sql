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
-- 2. finance_invoice_promotions - Add unique constraint
-- ============================================================================
-- This table has no primary key, causing massive duplicates during migration
-- The natural unique identifier is invoice_id + code combination
-- (same invoice can have multiple promotions, but same code shouldn't appear twice)

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' AND indexname = 'finance_invoice_promotions_unique_combo'
  ) THEN
    -- Remove duplicates: keep the earliest created_at for each invoice_id + code
    DELETE FROM finance_invoice_promotions a
    USING (
      SELECT invoice_id, code, MIN(created_at) as min_created_at
      FROM finance_invoice_promotions
      WHERE invoice_id IS NOT NULL AND code IS NOT NULL
      GROUP BY invoice_id, code
      HAVING COUNT(*) > 1
    ) b
    WHERE a.invoice_id = b.invoice_id 
      AND a.code = b.code 
      AND a.created_at > b.min_created_at;
    
    -- Add partial unique index (constraints cannot have WHERE clause)
    CREATE UNIQUE INDEX finance_invoice_promotions_unique_combo
    ON finance_invoice_promotions (invoice_id, code)
    WHERE invoice_id IS NOT NULL AND code IS NOT NULL;
  END IF;
END $$;



create table public.finance_invoice_promotions (
  code text not null default ''::text,
  promo_id uuid null,
  name text null default ''::text,
  description text null default ''::text,
  value integer not null,
  use_ratio boolean not null,
  created_at timestamp with time zone not null default now(),
  invoice_id uuid null,
  constraint finance_invoice_promotions_invoice_id_fkey foreign KEY (invoice_id) references finance_invoices (id) on update CASCADE on delete CASCADE,
  constraint finance_invoice_promotions_promo_id_fkey foreign KEY (promo_id) references workspace_promotions (id) on update CASCADE on delete set default
) TABLESPACE pg_default;

create unique INDEX IF not exists finance_invoice_promotions_unique_combo on public.finance_invoice_promotions using btree (invoice_id, code) TABLESPACE pg_default
where
  (
    (invoice_id is not null)
    and (code is not null)
  );
