-- Removes platform feature-flag state and audit. Clients receive no privileges.

set lock_timeout = '5s';
set statement_timeout = '60s';

drop function if exists private.platform_feature_flag_runtime_read(text);
drop function if exists private.platform_feature_flag_read_audit(uuid, integer, timestamptz, uuid);
drop function if exists private.platform_feature_flag_read_state(uuid);
drop function if exists private.platform_feature_flag_mutate(uuid, uuid, text, text, boolean, bigint);
drop function if exists private.platform_feature_flag_require_permission(uuid, text);
drop table if exists private.platform_feature_flag_audit;
drop table if exists private.platform_feature_flag_state;
drop function if exists private.platform_feature_flag_reject_audit_change();
drop function if exists private.platform_feature_flag_reject_direct_write();
drop function if exists private.platform_feature_flag_family(text);
