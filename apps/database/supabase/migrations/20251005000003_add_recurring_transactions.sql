-- Create recurring transaction types enum
CREATE TYPE recurring_frequency AS ENUM ('daily', 'weekly', 'monthly', 'yearly');

-- Create recurring transactions table
CREATE TABLE IF NOT EXISTS "public"."recurring_transactions" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "ws_id" uuid NOT NULL,
    "wallet_id" uuid NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "amount" numeric NOT NULL,
    "category_id" uuid,
    "frequency" recurring_frequency NOT NULL DEFAULT 'monthly',
    "start_date" date NOT NULL,
    "end_date" date,
    "next_occurrence" date NOT NULL,
    "last_occurrence" date,
    "is_active" boolean NOT NULL DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "recurring_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recurring_transactions_ws_id_fkey" FOREIGN KEY ("ws_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
    CONSTRAINT "recurring_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."workspace_wallets"("id") ON DELETE CASCADE,
    CONSTRAINT "recurring_transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."transaction_categories"("id") ON DELETE SET NULL
);

-- Enable Row Level Security
ALTER TABLE "public"."recurring_transactions" ENABLE ROW LEVEL SECURITY;

-- RLS Policies for recurring_transactions
CREATE POLICY "Users can view recurring transactions in their workspace"
    ON "public"."recurring_transactions"
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM workspace_members
            WHERE workspace_members.ws_id = recurring_transactions.ws_id
            AND workspace_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create recurring transactions in their workspace"
    ON "public"."recurring_transactions"
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM workspace_members
            WHERE workspace_members.ws_id = recurring_transactions.ws_id
            AND workspace_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update recurring transactions in their workspace"
    ON "public"."recurring_transactions"
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM workspace_members
            WHERE workspace_members.ws_id = recurring_transactions.ws_id
            AND workspace_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete recurring transactions in their workspace"
    ON "public"."recurring_transactions"
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM workspace_members
            WHERE workspace_members.ws_id = recurring_transactions.ws_id
            AND workspace_members.user_id = auth.uid()
        )
    );

-- Create indexes
CREATE INDEX IF NOT EXISTS "recurring_transactions_ws_id_idx" ON "public"."recurring_transactions" ("ws_id");
CREATE INDEX IF NOT EXISTS "recurring_transactions_wallet_id_idx" ON "public"."recurring_transactions" ("wallet_id");
CREATE INDEX IF NOT EXISTS "recurring_transactions_next_occurrence_idx" ON "public"."recurring_transactions" ("next_occurrence");
CREATE INDEX IF NOT EXISTS "recurring_transactions_is_active_idx" ON "public"."recurring_transactions" ("is_active");

-- Function to calculate next occurrence date
CREATE OR REPLACE FUNCTION calculate_next_occurrence(
    from_date DATE,
    frequency recurring_frequency
)
RETURNS DATE AS $$
BEGIN
    RETURN CASE frequency
        WHEN 'daily' THEN from_date + INTERVAL '1 day'
        WHEN 'weekly' THEN from_date + INTERVAL '1 week'
        WHEN 'monthly' THEN from_date + INTERVAL '1 month'
        WHEN 'yearly' THEN from_date + INTERVAL '1 year'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to process due recurring transactions
CREATE OR REPLACE FUNCTION process_recurring_transactions()
RETURNS TABLE(
    recurring_id UUID,
    transaction_id UUID,
    processed_count INT
) AS $$
DECLARE
    rec_record RECORD;
    new_transaction_id UUID;
    transactions_processed INT := 0;
BEGIN
    -- Find all active recurring transactions that are due
    FOR rec_record IN
        SELECT *
        FROM recurring_transactions
        WHERE is_active = true
        AND next_occurrence <= CURRENT_DATE
        AND (end_date IS NULL OR next_occurrence <= end_date)
    LOOP
        -- Create the transaction
        INSERT INTO wallet_transactions (
            wallet_id,
            amount,
            description,
            category_id,
            taken_at,
            report_opt_in
        )
        VALUES (
            rec_record.wallet_id,
            rec_record.amount,
            COALESCE(rec_record.description, rec_record.name),
            rec_record.category_id,
            rec_record.next_occurrence,
            true
        )
        RETURNING id INTO new_transaction_id;

        -- Update the recurring transaction
        UPDATE recurring_transactions
        SET
            last_occurrence = next_occurrence,
            next_occurrence = calculate_next_occurrence(next_occurrence, frequency),
            updated_at = now()
        WHERE id = rec_record.id;

        transactions_processed := transactions_processed + 1;

        RETURN QUERY SELECT rec_record.id, new_transaction_id, transactions_processed;
    END LOOP;

    -- Deactivate recurring transactions that have passed their end date
    UPDATE recurring_transactions
    SET is_active = false, updated_at = now()
    WHERE is_active = true
    AND end_date IS NOT NULL
    AND next_occurrence > end_date;
END;
$$ LANGUAGE plpgsql;

-- Function to get upcoming recurring transactions
CREATE OR REPLACE FUNCTION get_upcoming_recurring_transactions(_ws_id UUID, days_ahead INT DEFAULT 30)
RETURNS TABLE(
    id UUID,
    name TEXT,
    amount NUMERIC,
    frequency recurring_frequency,
    next_occurrence DATE,
    wallet_name TEXT,
    category_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        rt.id,
        rt.name,
        rt.amount,
        rt.frequency,
        rt.next_occurrence,
        ww.name AS wallet_name,
        tc.name AS category_name
    FROM recurring_transactions rt
    JOIN workspace_wallets ww ON rt.wallet_id = ww.id
    LEFT JOIN transaction_categories tc ON rt.category_id = tc.id
    WHERE rt.ws_id = _ws_id
    AND rt.is_active = true
    AND rt.next_occurrence <= CURRENT_DATE + days_ahead
    ORDER BY rt.next_occurrence ASC;
END;
$$ LANGUAGE plpgsql;
