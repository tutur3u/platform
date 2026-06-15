-- Harden transaction-list enrichment so it cannot be used as an anonymous
-- p_user_id impersonation primitive and so transfer metadata respects linked
-- transaction amount confidentiality.

CREATE OR REPLACE FUNCTION public.get_transaction_list_enrichment(
  p_ws_id uuid,
  p_transaction_ids uuid[],
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS TABLE (
  transaction_id uuid,
  wallet_currency text,
  wallet_icon text,
  wallet_image_src text,
  tags jsonb,
  transfer jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_auth_role text := auth.role();
  v_auth_uid uuid := auth.uid();
  v_can_view_amount boolean := false;
BEGIN
  IF p_transaction_ids IS NULL OR array_length(p_transaction_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF v_auth_uid IS NULL THEN
    IF COALESCE(v_auth_role, '') <> 'service_role' AND current_role <> 'service_role' THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  ELSIF p_user_id IS DISTINCT FROM v_auth_uid THEN
    IF NOT public.has_workspace_permission(p_ws_id, v_auth_uid, 'manage_workspace_roles') THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.ws_id = p_ws_id
      AND wm.user_id = p_user_id
  ) THEN
    RETURN;
  END IF;

  IF NOT (
    public.has_workspace_permission(p_ws_id, p_user_id, 'view_transactions')
    OR public.has_workspace_permission(p_ws_id, p_user_id, 'view_expenses')
    OR public.has_workspace_permission(p_ws_id, p_user_id, 'view_incomes')
    OR public.has_workspace_permission(p_ws_id, p_user_id, 'manage_finance')
  ) THEN
    RETURN;
  END IF;

  v_can_view_amount := public.has_workspace_permission(
    p_ws_id,
    p_user_id,
    'view_confidential_amount'
  );

  RETURN QUERY
  WITH requested_transactions AS (
    SELECT
      wt.id,
      wt.wallet_id
    FROM public.wallet_transactions wt
    JOIN private.workspace_wallets ww
      ON ww.id = wt.wallet_id
    WHERE ww.ws_id = p_ws_id
      AND wt.id = ANY(p_transaction_ids)
  )
  SELECT
    rt.id AS transaction_id,
    wallet.currency AS wallet_currency,
    wallet.icon::text AS wallet_icon,
    wallet.image_src AS wallet_image_src,
    COALESCE(tag_data.tags, '[]'::jsonb) AS tags,
    transfer_data.transfer
  FROM requested_transactions rt
  JOIN private.workspace_wallets wallet
    ON wallet.id = rt.wallet_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', tag.id,
        'name', tag.name,
        'color', tag.color
      )
      ORDER BY tag.name, tag.id
    ) AS tags
    FROM public.wallet_transaction_tags wtt
    JOIN public.transaction_tags tag
      ON tag.id = wtt.tag_id
    WHERE wtt.transaction_id = rt.id
  ) tag_data ON TRUE
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
      'linked_transaction_id', linked_tx.id,
      'linked_wallet_id', linked_wallet.id,
      'linked_wallet_name', linked_wallet.name,
      'linked_wallet_currency', linked_wallet.currency,
      'linked_amount', CASE
        WHEN linked_tx.is_amount_confidential AND NOT v_can_view_amount
          THEN NULL
        ELSE linked_tx.amount
      END,
      'linked_is_amount_confidential', linked_tx.is_amount_confidential,
      'linked_amount_redacted', linked_tx.is_amount_confidential AND NOT v_can_view_amount,
      'is_origin', transfer_link.from_transaction_id = rt.id
    ) AS transfer
    FROM public.workspace_wallet_transfers transfer_link
    JOIN public.wallet_transactions linked_tx
      ON linked_tx.id = CASE
        WHEN transfer_link.from_transaction_id = rt.id
          THEN transfer_link.to_transaction_id
        ELSE transfer_link.from_transaction_id
      END
    JOIN private.workspace_wallets linked_wallet
      ON linked_wallet.id = linked_tx.wallet_id
    WHERE transfer_link.from_transaction_id = rt.id
       OR transfer_link.to_transaction_id = rt.id
    LIMIT 1
  ) transfer_data ON TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.get_transaction_list_enrichment(
  uuid,
  uuid[],
  uuid
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.get_transaction_list_enrichment(
  uuid,
  uuid[],
  uuid
) FROM anon;

GRANT EXECUTE ON FUNCTION public.get_transaction_list_enrichment(
  uuid,
  uuid[],
  uuid
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_transaction_list_enrichment(
  uuid,
  uuid[],
  uuid
) IS
'Returns transaction-list enrichment for authorized Finance list/export callers.
Anonymous null-auth calls are rejected, service-role app-session calls may pass an explicit p_user_id,
and linked transfer amounts are redacted when the linked transaction amount is confidential.';

notify pgrst, 'reload schema';
