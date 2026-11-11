-- Disable board cycles before reverting sprint authorization consumers.
-- Retain the additive create_task_sprints and delete_task_sprints enum values.
-- PostgreSQL cannot drop individual enum values; rebuilding the shared enum
-- would rewrite unrelated permission columns and is not a safe rollback.
-- Existing role/default permission rows may remain dormant for roll-forward.
-- Any requested grant revocation uses the authorized role-management path;
-- this rollback neither deletes permission rows nor changes unrelated grants.
SELECT 1;
