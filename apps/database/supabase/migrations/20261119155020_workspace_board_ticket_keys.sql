begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Serialize the backfill with allocations and key writes.
lock table public.tasks, public.workspace_boards, public.task_projects in share row exclusive mode;

-- Number tasks that were in the trash during the original backfill so their
-- identifiers are available after restore. Keep every assigned number.
with unnumbered as materialized (
  select task.id, task.board_id,
    row_number() over (partition by task.board_id order by task.created_at, task.id) as position
  from public.tasks task
  join public.workspace_boards board on board.id = task.board_id
  where task.display_number is null
    and board.ws_id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid
), counters as (
  select board.id, greatest(board.next_task_number, coalesce(assigned.last_number, 0)::bigint + 1) as next_number
  from public.workspace_boards board
  join (select distinct board_id from unnumbered) affected on affected.board_id = board.id
  cross join lateral (
    select max(task.display_number) as last_number from public.tasks task where task.board_id = board.id
  ) assigned
), numbered as (
  update public.tasks task
  set display_number = counters.next_number + unnumbered.position - 1
  from unnumbered
  join counters on counters.id = unnumbered.board_id
  where task.id = unnumbered.id
  returning task.board_id, task.display_number
)
update public.workspace_boards board
set next_task_number = assigned.last_number + 1
from (select board_id, max(display_number) as last_number from numbered group by board_id) assigned
where board.id = assigned.board_id;

create table private.task_board_ticket_keys (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  ticket_prefix text not null,
  -- Keep keys reserved after a board is purged so an old ID never opens another board.
  board_id uuid not null,
  primary key (ws_id, ticket_prefix, board_id)
);

alter table private.task_board_ticket_keys enable row level security;
revoke all on private.task_board_ticket_keys from public, anon, authenticated, service_role;
grant select, insert on private.task_board_ticket_keys to service_role;

-- Retain every source of a legacy key, including keys that were already
-- ambiguous. The new allocator never gives those shared keys to another board.
insert into private.task_board_ticket_keys (ws_id, ticket_prefix, board_id)
select board.ws_id, coalesce(nullif(upper(btrim(board.ticket_prefix) collate "C"), ''), 'TASK'), board.id
from public.workspace_boards board
where board.ws_id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid
  and coalesce(nullif(upper(btrim(board.ticket_prefix) collate "C"), ''), 'TASK')
    ~ '^[A-Z][A-Z0-9_-]{0,255}$';

create function private.reserve_task_board_ticket_key()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  base_key text;
  candidate text;
  suffix integer := 1;
begin
  if new.ws_id = '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.ticket_prefix is not null
    and (new.ws_id, new.ticket_prefix) is not distinct from (old.ws_id, old.ticket_prefix) then
    return new;
  end if;

  -- Board key writes and project key writes share one workspace lock.
  perform pg_advisory_xact_lock(hashtextextended(new.ws_id::text, 1984));

  candidate := nullif(upper(btrim(new.ticket_prefix) collate "C"), '');
  if candidate is not null then
    if candidate !~ '^[A-Z][A-Z0-9_-]{0,11}$' then
      raise exception 'TASK_BOARD_TICKET_PREFIX_INVALID' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.task_projects project
      where project.ws_id = new.ws_id and project.ticket_key = candidate
    ) then
      raise exception 'TASK_BOARD_TICKET_PREFIX_PROJECT_KEY' using errcode = '23505';
    end if;
    if exists (
      select 1 from private.task_board_ticket_keys key
      where key.ws_id = new.ws_id and key.ticket_prefix = candidate and key.board_id <> new.id
    ) then
      raise exception 'TASK_BOARD_TICKET_PREFIX_RESERVED' using errcode = '23505';
    end if;
  else
    base_key := left(regexp_replace(regexp_replace(upper(new.name collate "C"), '[^A-Z0-9]', '', 'g'), '^[0-9]+', ''), 3);
    base_key := coalesce(nullif(base_key, ''), 'TASK');
    candidate := base_key;
    while exists (
      select 1 from public.task_projects project
      where project.ws_id = new.ws_id and project.ticket_key = candidate
    ) or exists (
      select 1 from private.task_board_ticket_keys key
      where key.ws_id = new.ws_id and key.ticket_prefix = candidate and key.board_id <> new.id
    ) loop
      suffix := suffix + 1;
      candidate := base_key || suffix::text;
    end loop;
  end if;

  insert into private.task_board_ticket_keys (ws_id, ticket_prefix, board_id)
  values (new.ws_id, candidate, new.id)
  on conflict do nothing;

  new.ticket_prefix := candidate;
  return new;
end;
$$;
-- tuturuuu: no-grant (trigger)
revoke all on function private.reserve_task_board_ticket_key() from public, anon, authenticated;

drop trigger guard_board_ticket_prefix_project_key on public.workspace_boards;
create trigger reserve_task_board_ticket_key before insert or update of ticket_prefix, ws_id on public.workspace_boards
for each row execute function private.reserve_task_board_ticket_key();

-- Keep valid non-colliding keys and all assigned task numbers. Boards sharing
-- a legacy key get distinct derived keys and keep the old key for lookup.
-- tuturuuu: reviewed(dynamic-sql-review): deterministic static backfill, no EXECUTE.
do $$
declare
  board record;
begin
  for board in
    select b.id, b.ws_id,
      coalesce(nullif(upper(btrim(b.ticket_prefix) collate "C"), ''), 'TASK') as effective_key
    from public.workspace_boards b
    where b.ws_id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid
    order by b.ws_id, b.created_at nulls last, b.id
  loop
    update public.workspace_boards
    set ticket_prefix = case when board.effective_key ~ '^[A-Z][A-Z0-9_-]{0,11}$'
      and not exists (
        select 1 from private.task_board_ticket_keys key
        where key.ws_id = board.ws_id and key.ticket_prefix = board.effective_key and key.board_id <> board.id
      ) and not exists (
        select 1 from public.task_projects project
        where project.ws_id = board.ws_id and project.ticket_key = board.effective_key
      ) then board.effective_key else null end
    where id = board.id and ws_id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid;
  end loop;
end;
$$;

create unique index workspace_boards_workspace_ticket_prefix_unique
  on public.workspace_boards (ws_id, ticket_prefix)
  where ws_id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid;

alter table public.workspace_boards add constraint workspace_boards_ticket_prefix_required
  check (
    ws_id = '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid or
    (ticket_prefix is not null and ticket_prefix ~ '^[A-Z][A-Z0-9_-]{0,11}$')
  );

-- Retain the existing project authorization and lock order. Extend each board
-- conflict predicate to include retained keys by workspace.
-- tuturuuu: reviewed(dynamic-sql-review): fixed signatures and literal predicate replacements; aborts on drift.
do $$
declare
  definition text;
  old_predicate text := $old$coalesce(nullif(upper(btrim(board.ticket_prefix)), ''), 'TASK')$old$;
  signature regprocedure;
begin
  foreach signature in array array[
    'private.assign_project_ticket_key()'::regprocedure,
    'private.protect_project_ticket_identity()'::regprocedure
  ] loop
    definition := pg_get_functiondef(signature);
    if strpos(definition, old_predicate) = 0 then
      raise exception 'BOARD_TICKET_PROJECT_CONTRACT_DRIFT';
    end if;
    definition := replace(definition, 'from public.workspace_boards board', $boards$
      from (
        select key.ws_id, key.ticket_prefix from private.task_board_ticket_keys key
        union all
        select legacy.ws_id, coalesce(nullif(upper(btrim(legacy.ticket_prefix)), ''), 'TASK')
        from public.workspace_boards legacy
        where legacy.ws_id = '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid
      ) board
    $boards$);
    definition := replace(definition, old_predicate, 'board.ticket_prefix');
    execute definition;
  end loop;
end;
$$;

-- Keep the same task visibility and pagination rules for current and retained
-- board keys. The direct predicate also supports the workspace excluded above.
-- tuturuuu: reviewed(dynamic-sql-review): fixed service-only RPC signatures and literal predicate replacement; aborts on drift.
do $$
declare
  definition text;
  old_predicate text := 'p_ticket_prefix is null or wb.ticket_prefix = p_ticket_prefix';
  signature regprocedure;
begin
  foreach signature in array array[
    'private.list_task_source_filter_ids(uuid,uuid,uuid,uuid,text,uuid[],uuid[],text[],text,integer,text,boolean,text,text,boolean,text,boolean,text,integer,integer,uuid[],uuid[],uuid[],text[],smallint,smallint,timestamptz,timestamptz,boolean)'::regprocedure,
    'private.count_task_source_filter_lists(uuid,uuid,uuid,uuid,text,uuid[],uuid[],text[],text,integer,text,boolean,text,text,boolean,text,boolean,uuid[],uuid[],uuid[],text[],smallint,smallint,timestamptz,timestamptz,boolean)'::regprocedure
  ] loop
    definition := pg_get_functiondef(signature);
    if strpos(definition, old_predicate) = 0 then
      raise exception 'BOARD_TICKET_SEARCH_CONTRACT_DRIFT';
    end if;
    definition := replace(definition, old_predicate, $new$
      p_ticket_prefix is null
      or coalesce(nullif(upper(btrim(wb.ticket_prefix) collate "C"), ''), 'TASK') = p_ticket_prefix
      or exists (
        select 1 from private.task_board_ticket_keys key
        where key.ws_id = wb.ws_id and key.board_id = wb.id and key.ticket_prefix = p_ticket_prefix
      )
    $new$);
    execute definition;
  end loop;
end;
$$;

-- The server handles guest and personal placement visibility after this lookup.
create function private.list_board_task_ids_by_ticket_prefix(
  p_workspace_ids uuid[],
  p_ticket_prefix text,
  p_display_number integer
) returns table(id uuid)
language sql stable security invoker
set search_path = pg_catalog, pg_temp
as $$
  select task.id
  from public.tasks task
  join public.workspace_boards board on board.id = task.board_id
  where board.ws_id = any(p_workspace_ids)
    and task.display_number = p_display_number
    and (
      (board.ws_id = '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid and
        coalesce(nullif(upper(btrim(board.ticket_prefix) collate "C"), ''), 'TASK') = p_ticket_prefix)
      or exists (
        select 1 from private.task_board_ticket_keys key
        where key.ws_id = board.ws_id and key.board_id = board.id and key.ticket_prefix = p_ticket_prefix
      )
    );
$$;

revoke all on function private.list_board_task_ids_by_ticket_prefix(uuid[], text, integer)
  from public, anon, authenticated;
grant execute on function private.list_board_task_ids_by_ticket_prefix(uuid[], text, integer)
  to service_role;

notify pgrst, 'reload schema';
commit;
