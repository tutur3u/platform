-- Create budgets table for workspace budget tracking
CREATE TABLE IF NOT EXISTS "public"."finance_budgets" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "ws_id" uuid NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "amount" numeric NOT NULL DEFAULT 0,
    "spent" numeric NOT NULL DEFAULT 0,
    "period" text NOT NULL DEFAULT 'monthly', -- monthly, yearly, custom
    "category_id" uuid,
    "wallet_id" uuid,
    "start_date" date NOT NULL,
    "end_date" date,
    "alert_threshold" numeric DEFAULT 80, -- percentage threshold for alerts
    "is_active" boolean NOT NULL DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "finance_budgets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "finance_budgets_ws_id_fkey" FOREIGN KEY ("ws_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
    CONSTRAINT "finance_budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."transaction_categories"("id") ON DELETE CASCADE,
    CONSTRAINT "finance_budgets_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."workspace_wallets"("id") ON DELETE CASCADE,
    CONSTRAINT "finance_budgets_amount_check" CHECK (amount >= 0),
    CONSTRAINT "finance_budgets_spent_check" CHECK (spent >= 0),
    CONSTRAINT "finance_budgets_alert_threshold_check" CHECK (alert_threshold >= 0 AND alert_threshold <= 100)
);

-- Enable Row Level Security
ALTER TABLE "public"."finance_budgets" ENABLE ROW LEVEL SECURITY;

-- RLS Policies for finance_budgets
CREATE POLICY "Users can view budgets in their workspace"
    ON "public"."finance_budgets"
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM workspace_members
            WHERE workspace_members.ws_id = finance_budgets.ws_id
            AND workspace_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create budgets in their workspace"
    ON "public"."finance_budgets"
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM workspace_members
            WHERE workspace_members.ws_id = finance_budgets.ws_id
            AND workspace_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update budgets in their workspace"
    ON "public"."finance_budgets"
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM workspace_members
            WHERE workspace_members.ws_id = finance_budgets.ws_id
            AND workspace_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete budgets in their workspace"
    ON "public"."finance_budgets"
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM workspace_members
            WHERE workspace_members.ws_id = finance_budgets.ws_id
            AND workspace_members.user_id = auth.uid()
        )
    );

-- Create indexes
CREATE INDEX IF NOT EXISTS "finance_budgets_ws_id_idx" ON "public"."finance_budgets" ("ws_id");
CREATE INDEX IF NOT EXISTS "finance_budgets_category_id_idx" ON "public"."finance_budgets" ("category_id");
CREATE INDEX IF NOT EXISTS "finance_budgets_wallet_id_idx" ON "public"."finance_budgets" ("wallet_id");
CREATE INDEX IF NOT EXISTS "finance_budgets_is_active_idx" ON "public"."finance_budgets" ("is_active");

-- Function to update budget spent amount based on transactions
CREATE OR REPLACE FUNCTION update_budget_spent()
RETURNS TRIGGER AS $$
DECLARE
    budget_record RECORD;
BEGIN
    -- Find all active budgets that might be affected
    FOR budget_record IN
        SELECT fb.id, fb.start_date, fb.end_date, fb.category_id, fb.wallet_id
        FROM finance_budgets fb
        JOIN workspace_wallets ww ON (fb.wallet_id IS NULL OR fb.wallet_id = ww.id)
        WHERE fb.is_active = true
        AND ww.ws_id = (
            SELECT ws_id FROM workspace_wallets WHERE id = COALESCE(NEW.wallet_id, OLD.wallet_id)
        )
    LOOP
        -- Calculate spent amount for this budget
        UPDATE finance_budgets
        SET spent = (
            SELECT COALESCE(ABS(SUM(wt.amount)), 0)
            FROM wallet_transactions wt
            WHERE wt.amount < 0 -- Only expenses
            AND wt.taken_at::date >= budget_record.start_date
            AND (budget_record.end_date IS NULL OR wt.taken_at::date <= budget_record.end_date)
            AND (budget_record.category_id IS NULL OR wt.category_id = budget_record.category_id)
            AND (budget_record.wallet_id IS NULL OR wt.wallet_id = budget_record.wallet_id)
        ),
        updated_at = now()
        WHERE id = budget_record.id;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update budget spent on transaction changes
CREATE TRIGGER update_budget_spent_trigger
AFTER INSERT OR UPDATE OR DELETE ON wallet_transactions
FOR EACH ROW
EXECUTE FUNCTION update_budget_spent();

-- Function to get budget status
CREATE OR REPLACE FUNCTION get_budget_status(_ws_id UUID)
RETURNS TABLE(
    budget_id UUID,
    budget_name TEXT,
    amount NUMERIC,
    spent NUMERIC,
    remaining NUMERIC,
    percentage_used NUMERIC,
    is_over_budget BOOLEAN,
    is_near_threshold BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        fb.id,
        fb.name,
        fb.amount,
        fb.spent,
        fb.amount - fb.spent AS remaining,
        CASE
            WHEN fb.amount > 0 THEN ROUND((fb.spent / fb.amount * 100)::numeric, 2)
            ELSE 0
        END AS percentage_used,
        fb.spent > fb.amount AS is_over_budget,
        CASE
            WHEN fb.amount > 0 THEN (fb.spent / fb.amount * 100) >= fb.alert_threshold
            ELSE false
        END AS is_near_threshold
    FROM finance_budgets fb
    WHERE fb.ws_id = _ws_id
    AND fb.is_active = true
    ORDER BY fb.created_at DESC;
END;
$$ LANGUAGE plpgsql;
