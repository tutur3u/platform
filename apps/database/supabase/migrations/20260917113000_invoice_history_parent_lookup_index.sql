-- Child audit events resolve their latest invoice snapshot by workspace AND id.
-- Keep this concurrent index as the only statement in this migration.
create index concurrently if not exists invoice_audit_workspace_invoice_time_idx
on audit.record_version ((coalesce(record->>'ws_id', old_record->>'ws_id')),
  (coalesce(record->>'id', old_record->>'id')), ts desc, id desc)
where table_name = 'finance_invoices';
