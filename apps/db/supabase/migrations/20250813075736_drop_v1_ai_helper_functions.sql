-- Drop legacy v1 AI analytics RPCs to keep only _v2 versions

DO $$
BEGIN
  -- get_ai_execution_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_ai_execution_summary'
      AND oid::regprocedure::text = 'get_ai_execution_summary(uuid, timestamp with time zone, timestamp with time zone)'
  ) THEN
    EXECUTE 'DROP FUNCTION get_ai_execution_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ)';
  END IF;

  -- get_ai_execution_daily_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_ai_execution_daily_stats'
      AND oid::regprocedure::text = 'get_ai_execution_daily_stats(uuid, timestamp with time zone, timestamp with time zone)'
  ) THEN
    EXECUTE 'DROP FUNCTION get_ai_execution_daily_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ)';
  END IF;

  -- get_ai_execution_model_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_ai_execution_model_stats'
      AND oid::regprocedure::text = 'get_ai_execution_model_stats(uuid, timestamp with time zone, timestamp with time zone)'
  ) THEN
    EXECUTE 'DROP FUNCTION get_ai_execution_model_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ)';
  END IF;

  -- get_ai_execution_monthly_cost(UUID, INTEGER, INTEGER)
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_ai_execution_monthly_cost'
      AND oid::regprocedure::text = 'get_ai_execution_monthly_cost(uuid, integer, integer)'
  ) THEN
    EXECUTE 'DROP FUNCTION get_ai_execution_monthly_cost(UUID, INTEGER, INTEGER)';
  END IF;
END $$;

-- Ensure legacy v1 RPCs are dropped regardless of pg_proc signature text formatting
DROP FUNCTION IF EXISTS public.get_ai_execution_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_ai_execution_daily_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_ai_execution_model_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_ai_execution_monthly_cost(UUID, INTEGER, INTEGER);

-- Also drop extended v1 signatures (with pricing/exchange rate) to fully remove v1 names
DROP FUNCTION IF EXISTS public.get_ai_execution_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, NUMERIC);
DROP FUNCTION IF EXISTS public.get_ai_execution_daily_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ, JSONB);
DROP FUNCTION IF EXISTS public.get_ai_execution_model_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ, JSONB);
DROP FUNCTION IF EXISTS public.get_ai_execution_monthly_cost(UUID, INTEGER, INTEGER, JSONB, NUMERIC);

