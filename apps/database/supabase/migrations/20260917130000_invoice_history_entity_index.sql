-- Rare entity filters must not scan every other invoice-related audit table.
-- Keep the concurrent index as the only statement in this migration.
create index concurrently if not exists invoice_child_audit_entity_time_idx
on audit.record_version (table_name, ts desc, id desc)
where table_name in ('finance_invoice_products', 'finance_invoice_promotions', 'finance_invoice_user_groups', 'wallet_transactions');
