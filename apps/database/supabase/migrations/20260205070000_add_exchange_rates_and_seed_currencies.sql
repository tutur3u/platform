-- ============================================================================
-- ADD EXCHANGE RATES TABLE AND SEED ALL SUPPORTED CURRENCIES
-- ============================================================================
-- This migration:
-- 1. Seeds all 30 supported currencies (only USD & VND exist today)
-- 2. Creates currency_exchange_rates table for daily rate storage
-- 3. Creates get_exchange_rate() SQL function for currency conversion
-- 4. Updates AI pricing functions to use dynamic exchange rates
-- 5. Schedules a daily pg_cron job to fetch rates via API

-- ============================================================================
-- Step 1: Seed all 30 supported currencies
-- ============================================================================
-- Use ON CONFLICT to update names for existing currencies and insert new ones
INSERT INTO currencies (code, name) VALUES
  ('AED', 'UAE Dirham'),
  ('AUD', 'Australian Dollar'),
  ('BRL', 'Brazilian Real'),
  ('CAD', 'Canadian Dollar'),
  ('CHF', 'Swiss Franc'),
  ('CNY', 'Chinese Yuan'),
  ('CZK', 'Czech Koruna'),
  ('DKK', 'Danish Krone'),
  ('EUR', 'Euro'),
  ('GBP', 'British Pound'),
  ('HKD', 'Hong Kong Dollar'),
  ('HUF', 'Hungarian Forint'),
  ('IDR', 'Indonesian Rupiah'),
  ('INR', 'Indian Rupee'),
  ('JPY', 'Japanese Yen'),
  ('KRW', 'South Korean Won'),
  ('MXN', 'Mexican Peso'),
  ('MYR', 'Malaysian Ringgit'),
  ('NOK', 'Norwegian Krone'),
  ('NZD', 'New Zealand Dollar'),
  ('PHP', 'Philippine Peso'),
  ('PLN', 'Polish Zloty'),
  ('SAR', 'Saudi Riyal'),
  ('SEK', 'Swedish Krona'),
  ('SGD', 'Singapore Dollar'),
  ('THB', 'Thai Baht'),
  ('TWD', 'Taiwan Dollar'),
  ('USD', 'US Dollar'),
  ('VND', 'Vietnamese Dong'),
  ('ZAR', 'South African Rand')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- ============================================================================
-- Step 2: Create currency_exchange_rates table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.currency_exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL DEFAULT 'USD' REFERENCES currencies(code),
  target_currency TEXT NOT NULL REFERENCES currencies(code),
  rate NUMERIC(20, 10) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (base_currency, target_currency, date)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date_desc
  ON currency_exchange_rates (date DESC);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair_date
  ON currency_exchange_rates (base_currency, target_currency, date DESC);

-- Enable RLS: read-only for authenticated, writes via admin/service_role only
ALTER TABLE public.currency_exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read exchange rates"
  ON public.currency_exchange_rates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage exchange rates"
  ON public.currency_exchange_rates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Step 3: Create get_exchange_rate() function
-- ============================================================================
-- Returns the exchange rate between two currencies for a given date.
-- Handles: same currency (1.0), direct USD lookup, and cross-rate via USD.
-- Falls back to the most recent available date if no rate for exact date.
CREATE OR REPLACE FUNCTION get_exchange_rate(
  p_from_currency TEXT,
  p_to_currency TEXT,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_from TEXT := UPPER(p_from_currency);
  v_to TEXT := UPPER(p_to_currency);
  v_rate NUMERIC;
  v_from_usd_rate NUMERIC;
  v_to_usd_rate NUMERIC;
BEGIN
  -- Same currency: return 1.0
  IF v_from = v_to THEN
    RETURN 1.0;
  END IF;

  -- Direct lookup: USD -> target
  IF v_from = 'USD' THEN
    SELECT rate INTO v_rate
    FROM currency_exchange_rates
    WHERE base_currency = 'USD'
      AND target_currency = v_to
      AND date <= p_date
    ORDER BY date DESC
    LIMIT 1;

    RETURN v_rate;
  END IF;

  -- Direct lookup: source -> USD (inverse)
  IF v_to = 'USD' THEN
    SELECT rate INTO v_rate
    FROM currency_exchange_rates
    WHERE base_currency = 'USD'
      AND target_currency = v_from
      AND date <= p_date
    ORDER BY date DESC
    LIMIT 1;

    IF v_rate IS NOT NULL AND v_rate != 0 THEN
      RETURN 1.0 / v_rate;
    END IF;

    RETURN NULL;
  END IF;

  -- Cross-rate via USD: from -> USD -> to
  -- Get USD -> from rate
  SELECT rate INTO v_from_usd_rate
  FROM currency_exchange_rates
  WHERE base_currency = 'USD'
    AND target_currency = v_from
    AND date <= p_date
  ORDER BY date DESC
  LIMIT 1;

  -- Get USD -> to rate
  SELECT rate INTO v_to_usd_rate
  FROM currency_exchange_rates
  WHERE base_currency = 'USD'
    AND target_currency = v_to
    AND date <= p_date
  ORDER BY date DESC
  LIMIT 1;

  IF v_from_usd_rate IS NOT NULL AND v_from_usd_rate != 0
     AND v_to_usd_rate IS NOT NULL THEN
    RETURN v_to_usd_rate / v_from_usd_rate;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION get_exchange_rate(TEXT, TEXT, DATE) IS
  'Returns the exchange rate from one currency to another. Uses USD as intermediary for cross-rates. Falls back to most recent available date.';

GRANT EXECUTE ON FUNCTION get_exchange_rate(TEXT, TEXT, DATE) TO authenticated;

-- ============================================================================
-- Step 4: Update AI pricing functions to use dynamic exchange rates
-- ============================================================================
-- Replace the hardcoded 26000 default with a dynamic lookup from the exchange
-- rates table, falling back to 26000 if no rate is available.

-- 4a. Update the base get_ai_execution_summary (no p_exchange_rate param)
-- Note: The 3-arg version was dropped in the pricing migration, only 5-arg exists
CREATE OR REPLACE FUNCTION get_ai_execution_summary(
  p_ws_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_pricing JSONB DEFAULT NULL,
  p_exchange_rate NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  total_executions BIGINT,
  total_cost_usd NUMERIC,
  total_cost_vnd NUMERIC,
  total_tokens BIGINT,
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  total_reasoning_tokens BIGINT,
  avg_cost_per_execution NUMERIC,
  avg_tokens_per_execution NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pricing JSONB := COALESCE(p_pricing, get_default_ai_pricing());
  v_exchange_rate NUMERIC := COALESCE(
    p_exchange_rate,
    get_exchange_rate('USD', 'VND'),
    26000
  );
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_executions,
    COALESCE(SUM(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)), 0) as total_cost_usd,
    COALESCE(SUM(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)) * v_exchange_rate, 0) as total_cost_vnd,
    SUM(wae.total_tokens)::BIGINT as total_tokens,
    SUM(wae.input_tokens)::BIGINT as total_input_tokens,
    SUM(wae.output_tokens)::BIGINT as total_output_tokens,
    SUM(wae.reasoning_tokens)::BIGINT as total_reasoning_tokens,
    COALESCE(AVG(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)), 0) as avg_cost_per_execution,
    COALESCE(AVG(wae.total_tokens::NUMERIC), 0) as avg_tokens_per_execution
  FROM workspace_ai_executions wae
  WHERE wae.ws_id = p_ws_id
    AND (p_start_date IS NULL OR wae.created_at >= p_start_date)
    AND (p_end_date IS NULL OR wae.created_at <= p_end_date);
END;
$$;

-- 4b. Update get_ai_execution_monthly_cost to use dynamic rate
CREATE OR REPLACE FUNCTION get_ai_execution_monthly_cost(
  p_ws_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  p_month INTEGER DEFAULT EXTRACT(MONTH FROM CURRENT_DATE),
  p_pricing JSONB DEFAULT NULL,
  p_exchange_rate NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  total_cost_usd NUMERIC,
  total_cost_vnd NUMERIC,
  executions BIGINT,
  avg_daily_cost NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pricing JSONB := COALESCE(p_pricing, get_default_ai_pricing());
  v_exchange_rate NUMERIC := COALESCE(
    p_exchange_rate,
    get_exchange_rate('USD', 'VND'),
    26000
  );
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)), 0) as total_cost_usd,
    COALESCE(SUM(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)) * v_exchange_rate, 0) as total_cost_vnd,
    COUNT(*)::BIGINT as executions,
    COALESCE(AVG(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)), 0) as avg_daily_cost
  FROM workspace_ai_executions wae
  WHERE wae.ws_id = p_ws_id
    AND EXTRACT(YEAR FROM wae.created_at) = p_year
    AND EXTRACT(MONTH FROM wae.created_at) = p_month;
END;
$$;

-- Re-grant execute permissions
GRANT EXECUTE ON FUNCTION get_ai_execution_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_execution_monthly_cost(UUID, INTEGER, INTEGER, JSONB, NUMERIC) TO authenticated;

-- ============================================================================
-- Step 5: Schedule daily pg_cron job to fetch exchange rates
-- ============================================================================
DO $outer$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'fetch-exchange-rates'
  ) THEN
    PERFORM cron.schedule(
      'fetch-exchange-rates',
      '0 6 * * *',
      $cron$
      SELECT net.http_post(
        url := COALESCE(
          current_setting('app.base_url', true),
          'https://tuturuuu.com'
        ) || '/api/cron/finance/exchange-rates',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            current_setting('app.service_role_key', true),
            ''
          )
        ),
        body := '{}'::jsonb
      ) AS request_id;
      $cron$
    );
  END IF;
END $outer$;

-- ============================================================================
-- Documentation
-- ============================================================================
COMMENT ON TABLE public.currency_exchange_rates IS
  'Daily exchange rates with USD as base currency. Populated by pg_cron via /api/cron/finance/exchange-rates.';
