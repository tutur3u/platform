CREATE TYPE public.workspace_order_product_kind AS ENUM (
  'subscription_product',
  'credit_pack',
  'unknown'
);

CREATE TABLE IF NOT EXISTS public.workspace_credit_packs (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  description TEXT,
  price BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  tokens NUMERIC(14, 4) NOT NULL CHECK (tokens > 0),
  expiry_days INTEGER NOT NULL CHECK (expiry_days > 0),
  archived BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_workspace_credit_packs_archived ON public.workspace_credit_packs (archived);

ALTER TABLE
  public.workspace_credit_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow view for credit packs" ON public.workspace_credit_packs FOR
SELECT
  TO authenticated USING (true);

CREATE POLICY "allow platform admin to insert credit packs" ON public.workspace_credit_packs FOR
INSERT
  TO authenticated WITH CHECK (
    has_workspace_permission(
      '00000000-0000-0000-0000-000000000000' :: uuid,
      auth.uid(),
      'manage_workspace_roles' :: text
    )
  );

CREATE POLICY "allow platform admin to update credit packs" ON public.workspace_credit_packs FOR
UPDATE
  TO authenticated USING (
    has_workspace_permission(
      '00000000-0000-0000-0000-000000000000' :: uuid,
      auth.uid(),
      'manage_workspace_roles' :: text
    )
  ) WITH CHECK (
    has_workspace_permission(
      '00000000-0000-0000-0000-000000000000' :: uuid,
      auth.uid(),
      'manage_workspace_roles' :: text
    )
  );

CREATE TABLE IF NOT EXISTS public.workspace_credit_pack_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  credit_pack_id UUID NOT NULL REFERENCES public.workspace_credit_packs(id) ON DELETE RESTRICT,
  polar_subscription_id TEXT NOT NULL UNIQUE,
  tokens_granted NUMERIC(14, 4) NOT NULL CHECK (tokens_granted > 0),
  tokens_remaining NUMERIC(14, 4) NOT NULL CHECK (tokens_remaining >= 0),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  status subscription_status NOT NULL DEFAULT 'active',
  CONSTRAINT workspace_credit_pack_purchases_tokens_balance_check CHECK (tokens_remaining <= tokens_granted)
);

CREATE INDEX IF NOT EXISTS idx_credit_pack_purchases_ws ON public.workspace_credit_pack_purchases (ws_id, expires_at, status);

CREATE INDEX IF NOT EXISTS idx_credit_pack_purchases_order ON public.workspace_credit_pack_purchases (polar_subscription_id);

ALTER TABLE
  public.workspace_credit_pack_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow users to select credit pack purchases" ON public.workspace_credit_pack_purchases FOR
SELECT
  TO authenticated USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_subscription' :: text)
  );

ALTER TABLE
  public.workspace_orders
ADD
  COLUMN IF NOT EXISTS credit_pack_id UUID REFERENCES public.workspace_credit_packs(id) ON DELETE
SET
  NULL;

ALTER TABLE
  public.workspace_orders
ADD
  COLUMN IF NOT EXISTS product_kind public.workspace_order_product_kind NOT NULL DEFAULT 'subscription_product';

CREATE INDEX IF NOT EXISTS workspace_orders_credit_pack_id_idx ON public.workspace_orders (credit_pack_id);

CREATE INDEX IF NOT EXISTS workspace_orders_product_kind_idx ON public.workspace_orders (product_kind);

UPDATE
  public.workspace_orders
SET
  product_kind = CASE
    WHEN credit_pack_id IS NOT NULL THEN 'credit_pack' :: public.workspace_order_product_kind
    WHEN product_id IS NOT NULL THEN 'subscription_product' :: public.workspace_order_product_kind
    ELSE 'unknown' :: public.workspace_order_product_kind
  END;

GRANT
SELECT
  ON TABLE public.workspace_credit_packs TO authenticated;

GRANT
SELECT
  ON TABLE public.workspace_credit_packs TO service_role;

GRANT ALL ON TABLE public.workspace_credit_packs TO service_role;

GRANT
SELECT
  ON TABLE public.workspace_credit_pack_purchases TO authenticated;

GRANT
SELECT
  ON TABLE public.workspace_credit_pack_purchases TO service_role;

GRANT ALL ON TABLE public.workspace_credit_pack_purchases TO service_role;