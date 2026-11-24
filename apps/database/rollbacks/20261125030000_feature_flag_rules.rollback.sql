-- Removes the runtime feature flag rule store, its audits and its write RPCs.
-- Dropping the tables deletes every rule and audit row: export
-- private.feature_flag_audit and private.feature_flag_definition_audit first.
-- Run 20261125030100_manage_feature_flags_permission.rollback.sql before this.
-- Clients receive no privileges. Leaves 20261109190002 objects untouched.

set lock_timeout = '5s';
set statement_timeout = '60s';

drop function if exists private.feature_flag_mutate_rule(uuid, uuid, text, text, text, uuid, text, integer, uuid[], uuid[], bigint, text, text);
drop function if exists private.feature_flag_sync_definitions(jsonb, boolean);
drop function if exists private.feature_flag_rule_json(text, integer, uuid[], uuid[]);
drop function if exists private.feature_flag_require_service_role();
drop function if exists private.feature_flag_require_root(uuid, text[]);
drop table if exists private.feature_flag_definition_audit;
drop table if exists private.feature_flag_audit;
drop table if exists private.feature_flag_rules;
drop table if exists private.feature_flag_definitions;
drop function if exists private.feature_flag_guard_write();
drop function if exists private.feature_flag_definition_error(text, text, text[], jsonb, text);
drop function if exists private.feature_flag_rule_shape_error(text, uuid, text, integer, uuid[], uuid[]);
