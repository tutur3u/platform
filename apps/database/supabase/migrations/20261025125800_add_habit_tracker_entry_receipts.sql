set lock_timeout = '5s';

-- Immutable receipt for every accepted keyed entry operation. A daily summary
-- row is mutable (later operations overwrite it), so receipts live apart from
-- it: an older operation retried after a newer one replays instead of
-- reverting the newer value. Receipts are bound to the tracker (scope), member
-- (actor), operation key and request body hash.
create table if not exists public.workspace_habit_tracker_entry_receipts (
  tracker_id uuid not null
    references public.workspace_habit_trackers(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  idempotency_key text not null,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  request_hash text not null,
  -- Kept when the entry is deleted, so a late retry cannot resurrect it.
  entry_id uuid
    references public.workspace_habit_tracker_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (tracker_id, user_id, idempotency_key),
  constraint workspace_habit_tracker_entry_receipts_key_format
    check (idempotency_key ~ '^[A-Za-z0-9:_-]{8,128}$'),
  constraint workspace_habit_tracker_entry_receipts_hash_format
    check (request_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists idx_workspace_habit_tracker_entry_receipts_entry
  on public.workspace_habit_tracker_entry_receipts (entry_id);

create index if not exists idx_workspace_habit_tracker_entry_receipts_user
  on public.workspace_habit_tracker_entry_receipts (user_id);

create index if not exists idx_workspace_habit_tracker_entry_receipts_ws
  on public.workspace_habit_tracker_entry_receipts (ws_id);

alter table public.workspace_habit_tracker_entry_receipts
  enable row level security;

revoke all on table public.workspace_habit_tracker_entry_receipts
  from public, anon, authenticated;
grant select, insert, update on table
  public.workspace_habit_tracker_entry_receipts to service_role;

comment on table public.workspace_habit_tracker_entry_receipts is
  'Immutable per-operation receipts for keyed habit tracker entry writes. Service role only.';

-- Accepts a keyed entry operation exactly once. Claiming the receipt and
-- writing the entry happen in one transaction, so a crash leaves neither. A
-- concurrent call with the same key waits on the receipt's primary key and
-- then replays; concurrent calls with different keys for the same daily
-- summary serialize on that row and each keep their own receipt.
create or replace function public.record_habit_tracker_entry_with_receipt(
  p_ws_id uuid,
  p_tracker_id uuid,
  p_user_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_entry_kind text,
  p_entry_date date,
  p_occurred_at timestamptz,
  p_values jsonb,
  p_primary_value numeric,
  p_note text,
  p_tags text[]
)
returns table (entry_id uuid, replayed boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_receipt public.workspace_habit_tracker_entry_receipts%rowtype;
  v_entry_id uuid;
begin
  perform 1
  from public.workspace_habit_trackers tracker
  where tracker.id = p_tracker_id and tracker.ws_id = p_ws_id;
  if not found then
    raise exception 'habit tracker not found in workspace'
      using errcode = 'P0404';
  end if;

  insert into public.workspace_habit_tracker_entry_receipts (
    tracker_id, user_id, idempotency_key, ws_id, request_hash
  )
  values (
    p_tracker_id, p_user_id, p_idempotency_key, p_ws_id, p_request_hash
  )
  on conflict on constraint workspace_habit_tracker_entry_receipts_pkey
  do nothing;

  if not found then
    select receipt.* into v_receipt
    from public.workspace_habit_tracker_entry_receipts receipt
    where receipt.tracker_id = p_tracker_id
      and receipt.user_id = p_user_id
      and receipt.idempotency_key = p_idempotency_key;
    if v_receipt.ws_id <> p_ws_id
      or v_receipt.request_hash <> p_request_hash then
      raise exception 'habit tracker operation key reused for a different request'
        using errcode = 'P0409';
    end if;
    return query select v_receipt.entry_id, true;
    return;
  end if;

  if p_entry_kind = 'daily_summary' then
    insert into public.workspace_habit_tracker_entries as entry (
      ws_id, tracker_id, user_id, entry_kind, entry_date, occurred_at,
      values, primary_value, note, tags, created_by
    )
    values (
      p_ws_id, p_tracker_id, p_user_id, 'daily_summary', p_entry_date,
      p_occurred_at, p_values, p_primary_value, p_note,
      coalesce(p_tags, '{}'::text[]), p_user_id
    )
    on conflict (tracker_id, user_id, entry_date)
      where entry_kind = 'daily_summary'
    do update set
      values = excluded.values,
      primary_value = excluded.primary_value,
      note = excluded.note,
      tags = excluded.tags,
      occurred_at = excluded.occurred_at,
      updated_at = now()
    returning entry.id into v_entry_id;
  else
    insert into public.workspace_habit_tracker_entries as entry (
      ws_id, tracker_id, user_id, entry_kind, entry_date, occurred_at,
      values, primary_value, note, tags, created_by
    )
    values (
      p_ws_id, p_tracker_id, p_user_id, p_entry_kind, p_entry_date,
      p_occurred_at, p_values, p_primary_value, p_note,
      coalesce(p_tags, '{}'::text[]), p_user_id
    )
    returning entry.id into v_entry_id;
  end if;

  update public.workspace_habit_tracker_entry_receipts receipt
  set entry_id = v_entry_id
  where receipt.tracker_id = p_tracker_id
    and receipt.user_id = p_user_id
    and receipt.idempotency_key = p_idempotency_key;

  return query select v_entry_id, false;
end;
$$;

revoke all on function public.record_habit_tracker_entry_with_receipt(
  uuid, uuid, uuid, text, text, text, date, timestamptz, jsonb, numeric, text,
  text[]
) from public, anon, authenticated;
grant execute on function public.record_habit_tracker_entry_with_receipt(
  uuid, uuid, uuid, text, text, text, date, timestamptz, jsonb, numeric, text,
  text[]
) to service_role;


reset lock_timeout;
