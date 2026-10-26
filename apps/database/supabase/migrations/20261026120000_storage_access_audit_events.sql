-- NEEDS APPROVAL: queue for the next migration batch. Scheduling stays in
-- Cloudflare Cron Control (job `database-storage-access-audit-retention`,
-- default off); no pg_cron schedule is added.
--
-- App-side storage access audit log. Service-role routes that sign, list,
-- download, upload, delete or share `workspaces` bucket objects record one
-- row per object decision, so a later exposure audit has actor and object
-- evidence. Writes are best-effort from the app (they never block a request).
--
-- Actor: a user id, or an API key id for SDK routes (`actor_kind`).
--
-- Privacy: only the actor id is personal data. Objects are identified by
-- their workspace, lower-cased root segment and either the Storage object id
-- or a SHA-256 hash of the full object name; file names are never stored.
-- Rows are kept for 90 days.
--
-- Access: RLS is enabled with no policies, so anon and authenticated read and
-- write nothing. Only service_role may insert and select; retention runs
-- through private.prune_storage_access_events().

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table private.storage_access_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  actor_kind text not null default 'user'
    check (actor_kind in ('user', 'api_key', 'anonymous')),
  ws_id uuid,
  path_root text
    check (path_root is null or char_length(path_root) between 1 and 64),
  object_id uuid,
  object_hash text check (object_hash is null or object_hash ~ '^[0-9a-f]{64}$'),
  action text not null
    check (action in ('sign', 'list', 'download', 'upload', 'delete', 'share')),
  route text not null
    check (
      char_length(route) between 5 and 128
      and route ~ '^/api/[]A-Za-z0-9/_.:[-]*$'
    ),
  outcome text not null
    check (outcome in ('allowed', 'denied', 'invalid', 'error')),
  item_count integer not null default 1 check (item_count between 0 and 1000)
);

comment on table private.storage_access_events is
  'App-side access audit for the workspaces Storage bucket (best-effort, 90-day retention). No file names; objects are identified by root plus object id or SHA-256 of the name. Service role only.';

create index storage_access_events_retention_idx
  on private.storage_access_events (occurred_at, id);
create index storage_access_events_ws_idx
  on private.storage_access_events (ws_id, occurred_at desc)
  where ws_id is not null;
create index storage_access_events_actor_idx
  on private.storage_access_events (actor_id, occurred_at desc)
  where actor_id is not null;

alter table private.storage_access_events enable row level security;
revoke all on table private.storage_access_events from public, anon, authenticated;
grant insert, select on table private.storage_access_events to service_role;

-- Deletes at most p_limit rows older than 90 days per call. Bounded by the
-- retention index, SKIP LOCKED and short timeouts; a backlog takes several
-- Cron Control slots.
create or replace function private.prune_storage_access_events(
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set statement_timeout = '10s'
set lock_timeout = '1s'
as $$
declare
  cutoff timestamptz := transaction_timestamp() - interval '90 days';
  deleted integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'p_limit must be between 1 and 1000' using errcode = '22023';
  end if;

  with expired as (
    select id from private.storage_access_events
    where occurred_at < cutoff
    order by occurred_at, id
    limit p_limit
    for update skip locked
  )
  delete from private.storage_access_events e
  using expired
  where e.id = expired.id;
  get diagnostics deleted = row_count;

  return jsonb_build_object('deleted', deleted);
end;
$$;

revoke all on function private.prune_storage_access_events(integer)
  from public, anon, authenticated;
grant execute on function private.prune_storage_access_events(integer)
  to service_role;

commit;
