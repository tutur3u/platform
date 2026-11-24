-- Keyset index for the owner-only receipt listing: it pages one actor's
-- receipts by (created_at desc, id desc), so the index matches that order.
CREATE INDEX IF NOT EXISTS product_feedback_receipts_actor_created_idx
  ON private.product_feedback_receipts (actor_id, created_at DESC, id DESC);
