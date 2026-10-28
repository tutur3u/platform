-- Rollback: removes the restrictive MFA policy from private.product_feedback_receipts.
-- This reopens the contract gap; the required-account-MFA contract will fail until it is restored.
DROP POLICY IF EXISTS account_required_mfa ON private.product_feedback_receipts;
