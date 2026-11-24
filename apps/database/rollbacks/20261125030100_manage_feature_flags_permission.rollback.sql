-- Removes the rule store definition sync, read and erasure RPCs. The
-- manage_feature_flags enum value stays: PostgreSQL cannot drop an enum value.
-- Roll this back before 20261125030000_feature_flag_rules.rollback.sql.
-- Clients receive no privileges.

set lock_timeout = '5s';
set statement_timeout = '60s';

drop function if exists private.feature_flag_erase_subject(text, uuid);
drop function if exists private.feature_flag_erase_json(jsonb, text, text);
drop function if exists private.feature_flag_read_audit(uuid, integer, timestamptz, uuid);
drop function if exists private.feature_flag_read_rules(uuid, text, text, integer, text, text, uuid);
drop function if exists private.feature_flag_read_subject_rules(text, uuid, uuid);
drop function if exists private.feature_flag_read_snapshot(text);
drop function if exists private.feature_flag_live_rule_json(private.feature_flag_rules);
drop function if exists private.feature_flag_sync_definitions(jsonb, boolean);
