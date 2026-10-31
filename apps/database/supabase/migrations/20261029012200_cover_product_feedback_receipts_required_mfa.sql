-- The required-account-MFA contract found one client-reachable relation without the
-- restrictive policy: authenticated has column-level SELECT on
-- private.product_feedback_receipts (20261018010000), a table created after the
-- one-time policy loop in 20260923130000 ran.
DROP POLICY IF EXISTS account_required_mfa ON private.product_feedback_receipts;
CREATE POLICY account_required_mfa ON private.product_feedback_receipts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.account_required_mfa_satisfied()))
  WITH CHECK ((SELECT public.account_required_mfa_satisfied()));
