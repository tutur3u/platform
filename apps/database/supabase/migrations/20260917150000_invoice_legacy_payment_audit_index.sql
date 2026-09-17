-- The fallback only needs payments without a recorded invoice link. Keep its
-- ordered scan independent of the much larger directly-linked payment history.
create index concurrently if not exists invoice_legacy_payment_audit_time_idx
on audit.record_version (ts desc, id desc)
where table_name = 'wallet_transactions'
  and coalesce(record->>'invoice_id', old_record->>'invoice_id') is null;
