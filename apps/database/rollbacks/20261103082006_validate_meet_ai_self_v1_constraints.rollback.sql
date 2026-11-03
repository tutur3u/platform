-- Constraint validation only changes validation metadata; keep the stronger validated constraints.
-- Earlier schema rollbacks remove these constraints when reverting the complete feature.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
commit;
