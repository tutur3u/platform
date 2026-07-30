-- Keep reservation expiry, Studio run state, and API-key counters atomic.
-- Previously the low-level helper refunded the balance but left linked runs in
-- "reserved" and left credits_reserved inflated, producing stale logs.

CREATE OR REPLACE FUNCTION public._release_expired_ai_credit_reservations(
  p_balance_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, private, pg_temp
AS $$
DECLARE
  v_released_amount NUMERIC := 0;
BEGIN
  WITH expired AS (
    UPDATE private.ai_credit_reservations
       SET status = 'expired',
           released_at = now(),
           updated_at = now(),
           metadata = COALESCE(metadata, '{}'::JSONB)
             || jsonb_build_object('expired_at', now())
     WHERE balance_id = p_balance_id
       AND status = 'reserved'
       AND expires_at <= now()
    RETURNING amount
  )
  SELECT COALESCE(sum(amount), 0)
    INTO v_released_amount
    FROM expired;

  IF v_released_amount > 0 THEN
    UPDATE public.workspace_ai_credit_balances
       SET total_used = GREATEST(total_used - v_released_amount, 0),
           updated_at = now()
     WHERE id = p_balance_id;
  END IF;

  WITH aborted_runs AS (
    UPDATE private.ai_studio_runs AS run
       SET status = 'aborted',
           error_class = 'reservation_expired',
           error_message = 'The credit reservation expired before settlement.',
           completed_at = now()
      FROM private.ai_credit_reservations AS reservation
     WHERE reservation.id = run.reservation_id
       AND reservation.balance_id = p_balance_id
       AND reservation.status = 'expired'
       AND run.status IN ('reserved', 'running')
    RETURNING run.api_key_id, run.reserved_credits
  ),
  released_by_key AS (
    SELECT api_key_id, sum(reserved_credits) AS credits
      FROM aborted_runs
     WHERE api_key_id IS NOT NULL
     GROUP BY api_key_id
  )
  UPDATE private.ai_studio_api_keys AS api_key
     SET credits_reserved = GREATEST(
           api_key.credits_reserved - released_by_key.credits,
           0
         ),
         updated_at = now()
    FROM released_by_key
   WHERE api_key.id = released_by_key.api_key_id;
END;
$$;

-- Reconcile rows stranded by the prior helper without refunding an already
-- expired reservation twice.
DO $$
DECLARE
  v_balance_id UUID;
BEGIN
  FOR v_balance_id IN
    SELECT DISTINCT reservation.balance_id
      FROM private.ai_credit_reservations AS reservation
      JOIN private.ai_studio_runs AS run
        ON run.reservation_id = reservation.id
     WHERE reservation.status = 'expired'
       AND run.status IN ('reserved', 'running')
  LOOP
    PERFORM public._release_expired_ai_credit_reservations(v_balance_id);
  END LOOP;
END;
$$;
