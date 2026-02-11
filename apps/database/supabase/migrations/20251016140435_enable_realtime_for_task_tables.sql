DO $$
BEGIN
  -- Add task_assignees if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'task_assignees'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_assignees;
  END IF;

  -- Add task_cycle_tasks if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'task_cycle_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_cycle_tasks;
  END IF;

  -- Add task_cycles if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'task_cycles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_cycles;
  END IF;

  -- Add task_initiatives if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'task_initiatives'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_initiatives;
  END IF;

  -- Add task_labels if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'task_labels'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_labels;
  END IF;

  -- Add task_lists if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'task_lists'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_lists;
  END IF;

  -- Add task_project_initiatives if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'task_project_initiatives'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_project_initiatives;
  END IF;

  -- Add task_project_tasks if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'task_project_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_project_tasks;
  END IF;

  -- Add task_projects if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'task_projects'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_projects;
  END IF;

  -- Add tasks if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  END IF;

  -- Add workspace_task_labels if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'workspace_task_labels'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_task_labels;
  END IF;
END $$;