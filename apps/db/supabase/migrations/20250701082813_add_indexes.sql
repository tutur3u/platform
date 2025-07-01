CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE INDEX
  ON "public"."user_group_post_checks" ("user_id");

CREATE INDEX
  ON "public"."user_group_posts" ("group_id");

CREATE INDEX
  ON "public"."user_group_posts" ("created_at" DESC);

CREATE INDEX
  ON "public"."workspace_users" ("ws_id");

-- For /users/groups
CREATE INDEX
  ON "public"."workspace_user_groups" ("name");

CREATE INDEX
  ON "public"."workspace_user_groups_users" ("group_id");

-- For /users/database
CREATE INDEX
  ON "public"."workspace_user_fields" ("ws_id", "created_at" DESC);

-- For /finance/transactions
CREATE INDEX
  ON "public"."workspace_wallets" ("ws_id");

CREATE INDEX
  ON "public"."wallet_transactions" ("taken_at" DESC, "created_at" DESC);

CREATE INDEX
  ON "public"."wallet_transactions" USING gin ("description" gin_trgm_ops);

-- For /finance/invoices
CREATE INDEX
  ON "public"."finance_invoices" ("ws_id", "created_at" DESC);