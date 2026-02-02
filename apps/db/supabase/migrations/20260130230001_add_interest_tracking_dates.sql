-- Add tracking date range to wallet_interest_configs
-- This allows users to specify when interest tracking should start/stop,
-- fixing the issue where all deposits appear as "pending" because the system
-- doesn't know when tracking actually began.

-- Add tracking date range columns
ALTER TABLE public.wallet_interest_configs
ADD COLUMN tracking_start_date DATE,
ADD COLUMN tracking_end_date DATE;

-- Add index for date filtering
CREATE INDEX idx_wallet_interest_configs_tracking_dates
ON public.wallet_interest_configs(tracking_start_date, tracking_end_date);

-- Add comments explaining the columns
COMMENT ON COLUMN public.wallet_interest_configs.tracking_start_date IS
  'Only transactions on or after this date are considered for interest calculation. NULL means from wallet creation.';
COMMENT ON COLUMN public.wallet_interest_configs.tracking_end_date IS
  'Transactions after this date are excluded. NULL means ongoing (no end date).';
