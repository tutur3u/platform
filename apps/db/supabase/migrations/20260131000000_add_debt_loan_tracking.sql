-- Add comprehensive debt/loan tracking support
-- Allows users to track money borrowed (debts) and money lent (loans)

-- Enum for debt/loan types
CREATE TYPE public.debt_loan_type AS ENUM ('debt', 'loan');

-- Enum for debt/loan status
CREATE TYPE public.debt_loan_status AS ENUM ('active', 'paid', 'defaulted', 'cancelled');

-- Enum for interest calculation type
CREATE TYPE public.interest_calculation_type AS ENUM ('simple', 'compound');

-- Main debt/loan entries table
CREATE TABLE public.workspace_debt_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  counterparty TEXT, -- Who you borrowed from / lent to
  type debt_loan_type NOT NULL,
  principal_amount BIGINT NOT NULL, -- Store in smallest currency unit (cents/dong)
  currency TEXT NOT NULL DEFAULT 'VND',
  interest_rate DECIMAL(10,6), -- Annual interest rate (optional)
  interest_type interest_calculation_type, -- Simple or compound interest
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status debt_loan_status NOT NULL DEFAULT 'active',
  wallet_id UUID REFERENCES public.workspace_wallets(id) ON DELETE SET NULL,
  creator_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Cached totals for performance (updated by triggers)
  total_paid BIGINT NOT NULL DEFAULT 0,
  total_interest_paid BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT chk_principal_positive CHECK (principal_amount > 0),
  CONSTRAINT chk_interest_rate_range CHECK (interest_rate IS NULL OR (interest_rate >= 0 AND interest_rate <= 100)),
  CONSTRAINT chk_interest_type_with_rate CHECK (
    (interest_rate IS NULL AND interest_type IS NULL) OR
    (interest_rate IS NOT NULL AND interest_type IS NOT NULL)
  ),
  CONSTRAINT chk_due_date_after_start CHECK (due_date IS NULL OR due_date >= start_date)
);

-- Track payments/collections linked to debt/loan entries
-- This links wallet_transactions to specific debts/loans
CREATE TABLE public.workspace_debt_loan_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_loan_id UUID NOT NULL REFERENCES public.workspace_debt_loans(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.wallet_transactions(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL, -- Portion of transaction applied to this debt/loan
  is_interest BOOLEAN NOT NULL DEFAULT FALSE, -- Is this an interest payment?
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_debt_loan_transaction UNIQUE(debt_loan_id, transaction_id),
  CONSTRAINT chk_amount_positive CHECK (amount > 0)
);

-- Indexes for performance
CREATE INDEX idx_debt_loans_ws_id ON public.workspace_debt_loans(ws_id);
CREATE INDEX idx_debt_loans_status ON public.workspace_debt_loans(ws_id, status);
CREATE INDEX idx_debt_loans_type ON public.workspace_debt_loans(ws_id, type);
CREATE INDEX idx_debt_loans_creator ON public.workspace_debt_loans(creator_id);
CREATE INDEX idx_debt_loans_wallet ON public.workspace_debt_loans(wallet_id) WHERE wallet_id IS NOT NULL;
CREATE INDEX idx_debt_loans_due_date ON public.workspace_debt_loans(due_date) WHERE due_date IS NOT NULL AND status = 'active';
CREATE INDEX idx_debt_loan_transactions_debt_loan_id ON public.workspace_debt_loan_transactions(debt_loan_id);
CREATE INDEX idx_debt_loan_transactions_transaction_id ON public.workspace_debt_loan_transactions(transaction_id);

-- Enable RLS
ALTER TABLE public.workspace_debt_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_debt_loan_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workspace_debt_loans
-- Access follows workspace membership
CREATE POLICY "Users can view debt/loans in their workspaces"
  ON public.workspace_debt_loans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.ws_id = workspace_debt_loans.ws_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create debt/loans in their workspaces"
  ON public.workspace_debt_loans FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.ws_id = workspace_debt_loans.ws_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update debt/loans in their workspaces"
  ON public.workspace_debt_loans FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.ws_id = workspace_debt_loans.ws_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete debt/loans in their workspaces"
  ON public.workspace_debt_loans FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.ws_id = workspace_debt_loans.ws_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policies for workspace_debt_loan_transactions
-- Access follows the debt/loan ownership
CREATE POLICY "Users can view debt/loan transactions in their workspaces"
  ON public.workspace_debt_loan_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_debt_loans dl
      JOIN public.workspace_members wm ON wm.ws_id = dl.ws_id
      WHERE dl.id = workspace_debt_loan_transactions.debt_loan_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create debt/loan transactions in their workspaces"
  ON public.workspace_debt_loan_transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_debt_loans dl
      JOIN public.workspace_members wm ON wm.ws_id = dl.ws_id
      WHERE dl.id = workspace_debt_loan_transactions.debt_loan_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update debt/loan transactions in their workspaces"
  ON public.workspace_debt_loan_transactions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_debt_loans dl
      JOIN public.workspace_members wm ON wm.ws_id = dl.ws_id
      WHERE dl.id = workspace_debt_loan_transactions.debt_loan_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete debt/loan transactions in their workspaces"
  ON public.workspace_debt_loan_transactions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_debt_loans dl
      JOIN public.workspace_members wm ON wm.ws_id = dl.ws_id
      WHERE dl.id = workspace_debt_loan_transactions.debt_loan_id
      AND wm.user_id = auth.uid()
    )
  );

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_debt_loan_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER trg_debt_loan_updated_at
  BEFORE UPDATE ON public.workspace_debt_loans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_debt_loan_updated_at();

-- Function to update cached totals when transactions are linked/unlinked
CREATE OR REPLACE FUNCTION public.update_debt_loan_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_total_paid BIGINT;
  v_total_interest_paid BIGINT;
BEGIN
  -- Calculate new totals
  IF TG_OP = 'DELETE' THEN
    SELECT
      COALESCE(SUM(CASE WHEN NOT is_interest THEN amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN is_interest THEN amount ELSE 0 END), 0)
    INTO v_total_paid, v_total_interest_paid
    FROM public.workspace_debt_loan_transactions
    WHERE debt_loan_id = OLD.debt_loan_id;

    UPDATE public.workspace_debt_loans
    SET total_paid = v_total_paid,
        total_interest_paid = v_total_interest_paid
    WHERE id = OLD.debt_loan_id;
  ELSE
    SELECT
      COALESCE(SUM(CASE WHEN NOT is_interest THEN amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN is_interest THEN amount ELSE 0 END), 0)
    INTO v_total_paid, v_total_interest_paid
    FROM public.workspace_debt_loan_transactions
    WHERE debt_loan_id = NEW.debt_loan_id;

    UPDATE public.workspace_debt_loans
    SET total_paid = v_total_paid,
        total_interest_paid = v_total_interest_paid
    WHERE id = NEW.debt_loan_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update totals on transaction changes
CREATE TRIGGER trg_update_debt_loan_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.workspace_debt_loan_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_debt_loan_totals();

-- Function to get debt/loan summary for a workspace
CREATE OR REPLACE FUNCTION public.get_debt_loan_summary(p_ws_id UUID)
RETURNS TABLE (
  total_debts BIGINT,
  total_loans BIGINT,
  active_debt_count INT,
  active_loan_count INT,
  total_debt_remaining BIGINT,
  total_loan_remaining BIGINT,
  net_position BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN type = 'debt' THEN principal_amount ELSE 0 END), 0)::BIGINT AS total_debts,
    COALESCE(SUM(CASE WHEN type = 'loan' THEN principal_amount ELSE 0 END), 0)::BIGINT AS total_loans,
    COUNT(CASE WHEN type = 'debt' AND status = 'active' THEN 1 END)::INT AS active_debt_count,
    COUNT(CASE WHEN type = 'loan' AND status = 'active' THEN 1 END)::INT AS active_loan_count,
    COALESCE(SUM(CASE WHEN type = 'debt' AND status = 'active' THEN principal_amount - total_paid ELSE 0 END), 0)::BIGINT AS total_debt_remaining,
    COALESCE(SUM(CASE WHEN type = 'loan' AND status = 'active' THEN principal_amount - total_paid ELSE 0 END), 0)::BIGINT AS total_loan_remaining,
    COALESCE(SUM(CASE
      WHEN type = 'loan' AND status = 'active' THEN principal_amount - total_paid
      WHEN type = 'debt' AND status = 'active' THEN -(principal_amount - total_paid)
      ELSE 0
    END), 0)::BIGINT AS net_position
  FROM public.workspace_debt_loans
  WHERE ws_id = p_ws_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get debts/loans with remaining balance
CREATE OR REPLACE FUNCTION public.get_debt_loans_with_balance(
  p_ws_id UUID,
  p_type debt_loan_type DEFAULT NULL,
  p_status debt_loan_status DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  counterparty TEXT,
  type debt_loan_type,
  principal_amount BIGINT,
  currency TEXT,
  interest_rate DECIMAL(10,6),
  interest_type interest_calculation_type,
  start_date DATE,
  due_date DATE,
  status debt_loan_status,
  wallet_id UUID,
  creator_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  total_paid BIGINT,
  total_interest_paid BIGINT,
  remaining_balance BIGINT,
  progress_percentage DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dl.id,
    dl.name,
    dl.description,
    dl.counterparty,
    dl.type,
    dl.principal_amount,
    dl.currency,
    dl.interest_rate,
    dl.interest_type,
    dl.start_date,
    dl.due_date,
    dl.status,
    dl.wallet_id,
    dl.creator_id,
    dl.created_at,
    dl.updated_at,
    dl.total_paid,
    dl.total_interest_paid,
    (dl.principal_amount - dl.total_paid)::BIGINT AS remaining_balance,
    CASE
      WHEN dl.principal_amount = 0 THEN 100.00
      ELSE ROUND((dl.total_paid::DECIMAL / dl.principal_amount * 100), 2)
    END AS progress_percentage
  FROM public.workspace_debt_loans dl
  WHERE dl.ws_id = p_ws_id
    AND (p_type IS NULL OR dl.type = p_type)
    AND (p_status IS NULL OR dl.status = p_status)
  ORDER BY
    CASE WHEN dl.status = 'active' THEN 0 ELSE 1 END,
    dl.due_date NULLS LAST,
    dl.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
