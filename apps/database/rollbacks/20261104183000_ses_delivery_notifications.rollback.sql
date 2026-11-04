-- Manual rollback only: drops the SES notification receipts and recorder
-- created by 20261104183000_ses_delivery_notifications.sql. Deploy app code
-- without the SES webhook route first. Static SQL: no DO block, no EXECUTE.
-- Suppression rows, bounce records and ledger statuses already written stay;
-- they are platform data, not part of this migration.
-- Refuses while receipts exist: export them, delete them deliberately, then
-- run this again.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE private.ses_notification_receipts IN ACCESS EXCLUSIVE MODE;

-- Fails with this message (as an integer cast error) when rows exist.
SELECT ('ses notification receipts has ' || count(*)
    || ' rows; export them before dropping')::integer
FROM private.ses_notification_receipts
HAVING count(*) > 0;

DROP FUNCTION IF EXISTS private.record_ses_notification(text, text, text, text, text, text, text[]);
DROP TABLE IF EXISTS private.ses_notification_receipts;

COMMIT;
