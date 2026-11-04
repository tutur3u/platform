-- Manual rollback only: drops the policy notice send ledger and its functions
-- created by 20261104180000_policy_notice_send_ledger.sql. Deploy app code
-- without the policy notice route first. Static SQL: no DO block, no EXECUTE.
-- Refuses while any run or delivery row exists, because the ledger is the only
-- record of who received the notice and the guard against a second send.
-- Export the rows, delete them deliberately, then run this again.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- The lock comes first, so no row can be written between the check and the drop.
LOCK TABLE private.policy_notice_runs, private.policy_notice_deliveries
    IN ACCESS EXCLUSIVE MODE;

-- Fails with this message (as an integer cast error) when rows exist.
SELECT ('policy notice ledger has ' || count(*)
    || ' run rows; export them before dropping')::integer
FROM private.policy_notice_runs
HAVING count(*) > 0;

DROP FUNCTION IF EXISTS private.policy_notice_health(text, text);
DROP FUNCTION IF EXISTS private.policy_notice_record(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS private.policy_notice_claim(uuid, text, text);
DROP FUNCTION IF EXISTS private.policy_notice_finish_run(uuid, text, text, jsonb);
DROP FUNCTION IF EXISTS private.policy_notice_start_run(text, text, text, uuid);
DROP FUNCTION IF EXISTS private.policy_notice_classify(text[]);
DROP FUNCTION IF EXISTS private.policy_notice_next_recipients(text, text, boolean, integer);
DROP FUNCTION IF EXISTS private.policy_notice_counts(text, text, boolean, boolean);
DROP FUNCTION IF EXISTS private.policy_notice_audience(boolean);
DROP FUNCTION IF EXISTS private.policy_notice_suppression(text);
DROP FUNCTION IF EXISTS private.policy_notice_recipient_hash(text);
DROP TABLE IF EXISTS private.policy_notice_deliveries;
DROP TABLE IF EXISTS private.policy_notice_runs;

COMMIT;
