-- Create transaction tags table
CREATE TABLE IF NOT EXISTS "public"."transaction_tags" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "ws_id" uuid NOT NULL,
    "name" text NOT NULL,
    "color" text NOT NULL DEFAULT '#6366f1', -- Default indigo color
    "description" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "transaction_tags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "transaction_tags_ws_id_fkey" FOREIGN KEY ("ws_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
    CONSTRAINT "transaction_tags_ws_id_name_key" UNIQUE ("ws_id", "name")
);

-- Create junction table for transaction-tag relationships (many-to-many)
CREATE TABLE IF NOT EXISTS "public"."wallet_transaction_tags" (
    "transaction_id" uuid NOT NULL,
    "tag_id" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "wallet_transaction_tags_pkey" PRIMARY KEY ("transaction_id", "tag_id"),
    CONSTRAINT "wallet_transaction_tags_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."wallet_transactions"("id") ON DELETE CASCADE,
    CONSTRAINT "wallet_transaction_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."transaction_tags"("id") ON DELETE CASCADE
);

-- Enable Row Level Security
ALTER TABLE "public"."transaction_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."wallet_transaction_tags" ENABLE ROW LEVEL SECURITY;

-- RLS Policies for transaction_tags
CREATE POLICY "Users can view tags in their workspace"
    ON "public"."transaction_tags"
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM workspace_members
            WHERE workspace_members.ws_id = transaction_tags.ws_id
            AND workspace_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create tags in their workspace"
    ON "public"."transaction_tags"
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM workspace_members
            WHERE workspace_members.ws_id = transaction_tags.ws_id
            AND workspace_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update tags in their workspace"
    ON "public"."transaction_tags"
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM workspace_members
            WHERE workspace_members.ws_id = transaction_tags.ws_id
            AND workspace_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete tags in their workspace"
    ON "public"."transaction_tags"
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM workspace_members
            WHERE workspace_members.ws_id = transaction_tags.ws_id
            AND workspace_members.user_id = auth.uid()
        )
    );

-- RLS Policies for wallet_transaction_tags
CREATE POLICY "Users can view transaction tags in their workspace"
    ON "public"."wallet_transaction_tags"
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM wallet_transactions wt
            JOIN workspace_wallets ww ON wt.wallet_id = ww.id
            JOIN workspace_members wm ON ww.ws_id = wm.ws_id
            WHERE wt.id = wallet_transaction_tags.transaction_id
            AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create transaction tags in their workspace"
    ON "public"."wallet_transaction_tags"
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM wallet_transactions wt
            JOIN workspace_wallets ww ON wt.wallet_id = ww.id
            JOIN workspace_members wm ON ww.ws_id = wm.ws_id
            WHERE wt.id = wallet_transaction_tags.transaction_id
            AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete transaction tags in their workspace"
    ON "public"."wallet_transaction_tags"
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM wallet_transactions wt
            JOIN workspace_wallets ww ON wt.wallet_id = ww.id
            JOIN workspace_members wm ON ww.ws_id = wm.ws_id
            WHERE wt.id = wallet_transaction_tags.transaction_id
            AND wm.user_id = auth.uid()
        )
    );

-- Create indexes
CREATE INDEX IF NOT EXISTS "transaction_tags_ws_id_idx" ON "public"."transaction_tags" ("ws_id");
CREATE INDEX IF NOT EXISTS "wallet_transaction_tags_transaction_id_idx" ON "public"."wallet_transaction_tags" ("transaction_id");
CREATE INDEX IF NOT EXISTS "wallet_transaction_tags_tag_id_idx" ON "public"."wallet_transaction_tags" ("tag_id");

-- Function to get transaction count by tag
CREATE OR REPLACE FUNCTION get_transaction_count_by_tag(_ws_id UUID)
RETURNS TABLE(
    tag_id UUID,
    tag_name TEXT,
    tag_color TEXT,
    transaction_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        tt.id,
        tt.name,
        tt.color,
        COUNT(wtt.transaction_id) AS transaction_count
    FROM transaction_tags tt
    LEFT JOIN wallet_transaction_tags wtt ON tt.id = wtt.tag_id
    WHERE tt.ws_id = _ws_id
    GROUP BY tt.id, tt.name, tt.color
    ORDER BY transaction_count DESC, tt.name;
END;
$$ LANGUAGE plpgsql;
