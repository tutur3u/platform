-- Manual rollback only: removes project ticket keys and per-project ticket
-- numbers, and restores the task save and history restore functions that
-- replace every project link. Run the 20261029060055 and 20261029060050
-- rollbacks first. Export task_projects.ticket_key and
-- task_project_tasks.ticket_number before running: they are dropped.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Undo only the relation-block patches; abort if the deployed bodies drifted.
DO $rollback$
DECLARE
  definition text;
  previous text;
BEGIN
  definition := pg_get_functiondef('public.update_task_with_relations_legacy_20260321(uuid,jsonb,uuid[],boolean,uuid[],boolean,uuid[],boolean,uuid)'::regprocedure);
  previous := definition;
  definition := replace(definition,
    'WHERE task_project_tasks.task_id = p_task_id AND NOT EXISTS (SELECT 1 FROM unnest(p_project_ids) requested(id) WHERE requested.id = task_project_tasks.project_id);',
    'WHERE task_project_tasks.task_id = p_task_id;');
  definition := replace(definition,
    ') deduplicated_projects WHERE NOT EXISTS (SELECT 1 FROM public.task_project_tasks existing WHERE existing.task_id = p_task_id AND existing.project_id = deduplicated_projects.project_id);',
    ') deduplicated_projects;');
  IF definition = previous OR position('AND NOT EXISTS (SELECT 1 FROM unnest(p_project_ids)' IN definition) > 0
     OR position('existing.project_id = deduplicated_projects.project_id' IN definition) > 0 THEN
    RAISE EXCEPTION 'PROJECT_TICKET_UPDATE_ROLLBACK_DRIFT';
  END IF;
  EXECUTE definition;

  definition := pg_get_functiondef('public.revert_task_to_history(uuid,uuid,uuid,text[])'::regprocedure);
  previous := definition;
  definition := replace(definition,
    $patched$delete from public.task_project_tasks where task_id = p_task_id
      and project_id not in (
        select coalesce(value->>'project_id', value->>'id')::uuid
        from jsonb_array_elements(coalesce(v_relationships->'projects', '[]'::jsonb))
      );$patched$,
    'delete from public.task_project_tasks where task_id = p_task_id;');
  definition := replace(definition,
    $patched$coalesce(v_relationships->'projects', '[]'::jsonb)
    ) where not exists (
      select 1 from public.task_project_tasks existing
      where existing.task_id = p_task_id
        and existing.project_id = coalesce(value->>'project_id', value->>'id')::uuid
    );$patched$,
    $original$coalesce(v_relationships->'projects', '[]'::jsonb)
    );$original$);
  IF definition = previous OR position('and project_id not in (' IN definition) > 0
     OR position('existing.project_id = coalesce' IN definition) > 0 THEN
    RAISE EXCEPTION 'PROJECT_TICKET_RESTORE_ROLLBACK_DRIFT';
  END IF;
  EXECUTE definition;
END;
$rollback$;

DROP TRIGGER protect_project_ticket_counter ON public.task_projects;
DROP TRIGGER protect_project_ticket_identity ON public.task_project_tasks;
DROP TRIGGER assign_project_ticket_number ON public.task_project_tasks;
DROP TRIGGER assign_project_ticket_key ON public.task_projects;
DROP FUNCTION private.protect_project_ticket_identity();
DROP FUNCTION private.assign_project_ticket_number();
DROP FUNCTION private.assign_project_ticket_key();

-- created_at keeps its now() default, which predates ticket numbers.
ALTER TABLE public.task_project_tasks
  ALTER COLUMN created_at DROP NOT NULL,
  DROP CONSTRAINT task_project_tasks_ticket_number_check,
  DROP CONSTRAINT task_project_tasks_ticket_number_unique,
  DROP COLUMN ticket_number;
ALTER TABLE public.task_projects
  DROP CONSTRAINT task_projects_next_ticket_number_check,
  DROP CONSTRAINT task_projects_ticket_key_unique,
  DROP CONSTRAINT task_projects_ticket_key_check,
  DROP COLUMN next_ticket_number,
  DROP COLUMN ticket_key;

NOTIFY pgrst, 'reload schema';
COMMIT;
