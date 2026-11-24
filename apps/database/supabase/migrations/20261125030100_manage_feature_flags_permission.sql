-- Root-workspace permission to write platform-controlled runtime feature
-- flag rules (private.feature_flag_mutate_rule). It is checked only in the
-- root workspace through public.has_workspace_permission, which reads the
-- permission as text at run time, so this transaction never uses the value.
-- Reading rules and audit also accepts view_infrastructure.

set lock_timeout = '5s';
set statement_timeout = '60s';

alter type public.workspace_role_permission
  add value if not exists 'manage_feature_flags';
