-- IF NOT EXISTS can skip an INVALID index left by a failed concurrent build.
-- Do not advance to the receipt/RPC migration without enforced uniqueness.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_index
    where indexrelid = pg_catalog.to_regclass(
      'public.idx_workspace_habit_trackers_creation_key_active'
    )
      and indrelid = 'public.workspace_habit_trackers'::regclass
      and indisvalid
      and indisunique
  ) then
    raise exception using
      errcode = '55000',
      message = 'Habit tracker creation-key unique index is missing or invalid',
      hint = 'Resolve active creation-key duplicates, drop the invalid index concurrently outside a transaction, rebuild it, then retry pending migrations. See the Mira health planning tools recovery runbook.';
  end if;
end;
$$;
