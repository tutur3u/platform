-- In-place edits are distinct from consent/settings changes. Existing audit
-- grants, membership admission and policies remain unchanged.
alter table private.ai_memory_audit
  drop constraint ai_memory_audit_action_check;
alter table private.ai_memory_audit
  add constraint ai_memory_audit_action_check
  check (action in ('backfill', 'delete', 'export', 'settings_update', 'edit'));
