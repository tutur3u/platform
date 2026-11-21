-- NON-TRANSACTIONAL: keep this as the only statement; Supabase executes it outside its transaction batch.
-- One deduction per chat message from the cutoff on; older rows cannot block the build. It must not
-- block ledger inserts while it builds. A failed build leaves the index INVALID: drop it and retry
-- only after no chat message has two deduction rows on or after the cutoff.
create unique index concurrently if not exists ai_credit_transactions_one_chat_message_deduction
  on public.ai_credit_transactions (chat_message_id)
  where transaction_type = 'deduction'
    and chat_message_id is not null
    and created_at >= timestamptz '2026-11-21 00:00:00+00';
