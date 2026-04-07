-- Migration: add_transaction_list_enrichment_rpc
-- Consolidates transaction-list tag, wallet, and transfer enrichment into one batch RPC
-- so list APIs avoid multiple follow-up queries after the primary transaction RPC.

CREATE INDEX IF NOT EXISTS workspace_wallet_transfers_to_transaction_id_idx
ON public.workspace_wallet_transfers (to_transaction_id);

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
BEGIN
  IF p_transaction_ids IS NULL OR array_length(p_transaction_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    IF NOT public.has_workspace_permission(p_ws_id, auth.uid(), 'manage_workspace_roles') THEN
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

  RETURN QUERY
  WITH requested_transactions AS (
    SELECT
      wt.id,
      wt.wallet_id
    FROM public.wallet_transactions wt
    JOIN public.workspace_wallets ww
      ON ww.id = wt.wallet_id
    WHERE ww.ws_id = p_ws_id
      AND wt.id = ANY(p_transaction_ids)
  )
  SELECT
    rt.id AS transaction_id,
    wallet.currency AS wallet_currency,
    wallet.icon AS wallet_icon,
    wallet.image_src AS wallet_image_src,
    COALESCE(tag_data.tags, '[]'::jsonb) AS tags,
    transfer_data.transfer
  FROM requested_transactions rt
  JOIN public.workspace_wallets wallet
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
      'linked_amount', linked_tx.amount,
      'is_origin', transfer_link.from_transaction_id = rt.id
    ) AS transfer
    FROM public.workspace_wallet_transfers transfer_link
    JOIN public.wallet_transactions linked_tx
      ON linked_tx.id = CASE
        WHEN transfer_link.from_transaction_id = rt.id
          THEN transfer_link.to_transaction_id
        ELSE transfer_link.from_transaction_id
      END
    JOIN public.workspace_wallets linked_wallet
      ON linked_wallet.id = linked_tx.wallet_id
    WHERE transfer_link.from_transaction_id = rt.id
       OR transfer_link.to_transaction_id = rt.id
    LIMIT 1
  ) transfer_data ON TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_transaction_list_enrichment(
  uuid,
  uuid[],
  uuid
) TO authenticated;

COMMENT ON FUNCTION public.get_transaction_list_enrichment(
  uuid,
  uuid[],
  uuid
) IS
'Returns batched transaction-list enrichment data for a workspace-scoped set of transactions.
Includes wallet presentation fields, aggregated tags, and linked transfer metadata so API routes
can avoid multiple follow-up queries after get_wallet_transactions_with_permissions.';
