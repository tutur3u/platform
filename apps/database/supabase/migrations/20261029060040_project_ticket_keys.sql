-- Project ticket identity is independent of the retained board display number.
alter table public.task_projects
  add column ticket_key text default null,
  add column next_ticket_number integer not null default 1,
  add constraint task_projects_ticket_key_check check (ticket_key ~ '^[A-Z][A-Z0-9]{1,9}$'),
  add constraint task_projects_ticket_key_unique unique (ws_id, ticket_key),
  add constraint task_projects_next_ticket_number_check check (next_ticket_number > 0);
alter table public.task_project_tasks
  add column ticket_number integer default null,
  add constraint task_project_tasks_ticket_number_unique unique (project_id, ticket_number),
  add constraint task_project_tasks_ticket_number_check check (ticket_number > 0);

create function private.assign_project_ticket_key()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  base_key text;
  candidate text;
  suffix integer := 1;
begin
  -- Serialize every key write in a workspace, chosen or generated, so a
  -- generated key never races a chosen one into a unique violation.
  perform pg_advisory_xact_lock(hashtextextended(new.ws_id::text, 1984));
  if new.ticket_key is not null then
    -- Choosing a key is project management; members get the derived key.
    if auth.role() = 'authenticated' and
      not coalesce(public.has_workspace_permission(new.ws_id, auth.uid(), 'manage_projects'), false) then
      raise exception 'PROJECT_TICKET_KEY_MANAGEMENT_DENIED' using errcode = '42501';
    end if;
    return new;
  end if;
  base_key := left(regexp_replace(regexp_replace(upper(new.name collate "C"), '[^A-Z0-9]', '', 'g'), '^[0-9]+', ''), 3);
  if length(base_key) < 2 then base_key := 'PRJ'; end if;
  candidate := base_key;
  while exists (select 1 from public.task_projects p where p.ws_id = new.ws_id and p.ticket_key = candidate) loop
    suffix := suffix + 1;
    candidate := left(base_key, 10 - length(suffix::text)) || suffix::text;
  end loop;
  new.ticket_key := candidate;
  return new;
end;
$$;
-- tuturuuu: no-grant (trigger)
revoke all on function private.assign_project_ticket_key() from public, anon, authenticated;
create trigger assign_project_ticket_key before insert on public.task_projects
for each row execute function private.assign_project_ticket_key();

-- Reuse the insert derivation for deterministic, workspace-local backfill.
create trigger backfill_project_ticket_key before update of ticket_key on public.task_projects
for each row when (new.ticket_key is null) execute function private.assign_project_ticket_key();
-- tuturuuu: reviewed(dynamic-sql-review): static backfill loop, no EXECUTE.
do $$
declare project record;
begin
  for project in select id from public.task_projects order by ws_id, created_at nulls last, id loop
    update public.task_projects set ticket_key = null where id = project.id;
  end loop;
end;
$$;
drop trigger backfill_project_ticket_key on public.task_projects;
alter table public.task_projects alter column ticket_key set not null;

update public.task_project_tasks link
set created_at = coalesce(task.created_at, now())
from public.tasks task where task.id = link.task_id and link.created_at is null;
alter table public.task_project_tasks alter column created_at set default now(), alter column created_at set not null;

with numbered as (
  select link.project_id, link.task_id,
    row_number() over (partition by link.project_id order by link.created_at, task.created_at, task.id)::integer as number
  from public.task_project_tasks link join public.tasks task on task.id = link.task_id
)
update public.task_project_tasks link set ticket_number = numbered.number
from numbered where link.project_id = numbered.project_id and link.task_id = numbered.task_id;
update public.task_projects project set next_ticket_number = coalesce(
  (select max(link.ticket_number) + 1 from public.task_project_tasks link where link.project_id = project.id), 1
);
alter table public.task_project_tasks alter column ticket_number set not null;

-- Invoker privileges preserve existing manage_projects RLS on both tables.
create function private.assign_project_ticket_number()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  -- Always allocate server-side; callers cannot supply or reuse a number.
  update public.task_projects set next_ticket_number = next_ticket_number + 1
  where id = new.project_id returning next_ticket_number - 1 into new.ticket_number;
  if not found then raise exception 'PROJECT_TICKET_ALLOCATION_DENIED' using errcode = '42501'; end if;
  new.created_at := coalesce(new.created_at, now());
  return new;
end;
$$;
revoke all on function private.assign_project_ticket_number() from public, anon, authenticated;
create trigger assign_project_ticket_number before insert on public.task_project_tasks
for each row execute function private.assign_project_ticket_number();

create function private.protect_project_ticket_identity()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_table_name = 'task_project_tasks' then
    if (new.project_id, new.task_id, new.ticket_number, new.created_at) is distinct from
       (old.project_id, old.task_id, old.ticket_number, old.created_at) then
      raise exception 'PROJECT_TICKET_IDENTITY_IMMUTABLE' using errcode = '23514';
    end if;
  end if;
  -- task_projects only from here (task_project_tasks has no ticket_key).
  if tg_table_name <> 'task_projects' then
    return new;
  end if;
  -- Key edits take the workspace key lock that key assignment uses.
  if new.ticket_key is distinct from old.ticket_key then
    perform pg_advisory_xact_lock(hashtextextended(new.ws_id::text, 1984));
  end if;
  if new.ticket_key is distinct from old.ticket_key and
    auth.role() is distinct from 'service_role' and
    not coalesce(public.has_workspace_permission(new.ws_id, auth.uid(), 'manage_projects'), false) then
    raise exception 'PROJECT_TICKET_KEY_MANAGEMENT_DENIED' using errcode = '42501';
  elsif new.next_ticket_number < old.next_ticket_number then
    raise exception 'PROJECT_TICKET_COUNTER_CANNOT_DECREASE' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_project_ticket_identity() from public, anon, authenticated;
create trigger protect_project_ticket_identity before update on public.task_project_tasks
for each row execute function private.protect_project_ticket_identity();
create trigger protect_project_ticket_counter before update of next_ticket_number, ticket_key on public.task_projects
for each row execute function private.protect_project_ticket_identity();
-- Preserve unchanged memberships when saving a task or restoring history.
-- Patch only the relation block, retaining deployed authorization, actor/history
-- logic, function settings and ACLs. Abort if the expected contract has drifted.
-- tuturuuu: reviewed(dynamic-sql-review): EXECUTEs only pg_get_functiondef output of two fixed signatures after a fixed text patch; aborts on drift.
do $migration$
declare
  definition text;
  previous text;
begin
  definition := pg_get_functiondef('public.update_task_with_relations_legacy_20260321(uuid,jsonb,uuid[],boolean,uuid[],boolean,uuid[],boolean,uuid)'::regprocedure);
  previous := definition;
  definition := replace(definition,
    'WHERE task_project_tasks.task_id = p_task_id;',
    'WHERE task_project_tasks.task_id = p_task_id AND NOT EXISTS (SELECT 1 FROM unnest(p_project_ids) requested(id) WHERE requested.id = task_project_tasks.project_id);');
  definition := replace(definition,
    ') deduplicated_projects;',
    ') deduplicated_projects WHERE NOT EXISTS (SELECT 1 FROM public.task_project_tasks existing WHERE existing.task_id = p_task_id AND existing.project_id = deduplicated_projects.project_id);');
  if definition = previous or position('AND NOT EXISTS (SELECT 1 FROM unnest(p_project_ids)' in definition) = 0
     or position('existing.project_id = deduplicated_projects.project_id' in definition) = 0 then
    raise exception 'PROJECT_TICKET_UPDATE_CONTRACT_DRIFT';
  end if;
  execute definition;

  definition := pg_get_functiondef('public.revert_task_to_history(uuid,uuid,uuid,text[])'::regprocedure);
  previous := definition;
  definition := replace(definition,
    'delete from public.task_project_tasks where task_id = p_task_id;',
    $replacement$delete from public.task_project_tasks where task_id = p_task_id
      and project_id not in (
        select coalesce(value->>'project_id', value->>'id')::uuid
        from jsonb_array_elements(coalesce(v_relationships->'projects', '[]'::jsonb))
      );$replacement$);
  definition := replace(definition,
    $old$coalesce(v_relationships->'projects', '[]'::jsonb)
    );$old$,
    $replacement$coalesce(v_relationships->'projects', '[]'::jsonb)
    ) where not exists (
      select 1 from public.task_project_tasks existing
      where existing.task_id = p_task_id
        and existing.project_id = coalesce(value->>'project_id', value->>'id')::uuid
    );$replacement$);
  if definition = previous or position('and project_id not in (' in definition) = 0
     or position('existing.project_id = coalesce' in definition) = 0 then
    raise exception 'PROJECT_TICKET_RESTORE_CONTRACT_DRIFT';
  end if;
  execute definition;
end;
$migration$;

notify pgrst, 'reload schema';
