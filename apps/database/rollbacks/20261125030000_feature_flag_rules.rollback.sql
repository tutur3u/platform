-- Removes the runtime feature flag rule store, its audit and its RPCs.
-- Clients receive no privileges. Leaves 20261109190002 objects untouched.

set lock_timeout = '5s';
set statement_timeout = '60s';

drop function if exists private.feature_flag_read_audit(uuid, integer, timestamptz);
drop function if exists private.feature_flag_read_rules(uuid, text, text);
drop function if exists private.feature_flag_read_snapshot(text);
drop function if exists private.feature_flag_mutate_rule(uuid, uuid, text, text, text, uuid, text, integer, uuid[], uuid[], bigint, text, text);
drop function if exists private.feature_flag_sync_definitions(jsonb);
drop function if exists private.feature_flag_rule_json(text, integer, uuid[], uuid[]);
drop function if exists private.feature_flag_require_root(uuid, text[]);
drop table if exists private.feature_flag_audit;
drop table if exists private.feature_flag_rules;
drop table if exists private.feature_flag_definitions;
drop function if exists private.feature_flag_guard_write();
drop function if exists private.feature_flag_definition_error(text, text, text[], jsonb, text);
drop function if exists private.feature_flag_rule_shape_error(text, uuid, text, integer, uuid[], uuid[]);
