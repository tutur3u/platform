-- Second gate after 20261121184500, which checks the same in its own
-- transaction: fails the apply unless the one-deduction-per-chat-message index
-- from 20261121184400 exists and is valid. A concurrent build that fails (for
-- example on existing duplicate deductions) leaves the index INVALID, and
-- `create unique index concurrently if not exists` then skips it on a retry;
-- an INVALID index does not guarantee uniqueness. Read-only.
-- tuturuuu: reviewed(dynamic-sql-review): read-only pg_index validity guard; static SQL, no EXECUTE.
do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_index i
     where i.indexrelid = pg_catalog.to_regclass(
             'public.ai_credit_transactions_one_chat_message_deduction'
           )
       and i.indrelid = 'public.ai_credit_transactions'::regclass
       and i.indisunique
       and i.indisvalid
       and i.indisready
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'AI_CREDIT_CHAT_DEDUCTION_INDEX_NOT_VALID',
      hint = 'Resolve duplicate deductions per chat message since 2026-11-21 00:00Z, then run "drop index concurrently if exists public.ai_credit_transactions_one_chat_message_deduction;" outside a transaction. Rebuild with the exact statement in 20261121184400. If that version is already recorded in supabase_migrations.schema_migrations, run the statement by hand; db push will not re-run it. Then retry from 20261121184500.';
  end if;
end;
$$;
