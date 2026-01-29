-- Migration: Fix report_opt_in defaults for existing data
-- Issue: Statistics show 0 because existing records may have NULL report_opt_in values
-- which are filtered out by the income/expense RPC functions that check report_opt_in = true
--
-- Solution: Update NULL values to true while preserving intentionally set false values.
-- This ensures existing data is included in statistics without overriding user preferences.

-- Fix report_opt_in for wallet_transactions where NULL
-- Only updates NULL values, preserves intentionally set false values
UPDATE public.wallet_transactions
SET report_opt_in = true
WHERE report_opt_in IS NULL;

-- Fix report_opt_in for workspace_wallets where NULL
UPDATE public.workspace_wallets
SET report_opt_in = true
WHERE report_opt_in IS NULL;

-- Ensure the columns have NOT NULL constraint with DEFAULT true
-- (These may already exist from the original migration, but this ensures consistency)
ALTER TABLE public.wallet_transactions
ALTER COLUMN report_opt_in SET DEFAULT true;

ALTER TABLE public.workspace_wallets
ALTER COLUMN report_opt_in SET DEFAULT true;

-- Add NOT NULL constraint if not already present (using DO block for idempotency)
DO $$
BEGIN
  -- For wallet_transactions
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'wallet_transactions'
    AND column_name = 'report_opt_in'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.wallet_transactions ALTER COLUMN report_opt_in SET NOT NULL;
  END IF;

  -- For workspace_wallets
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'workspace_wallets'
    AND column_name = 'report_opt_in'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.workspace_wallets ALTER COLUMN report_opt_in SET NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.wallet_transactions.report_opt_in IS
  'Whether this transaction should be included in financial reports and statistics. Defaults to true.';

COMMENT ON COLUMN public.workspace_wallets.report_opt_in IS
  'Whether this wallet and its transactions should be included in financial reports and statistics. Defaults to true.';
