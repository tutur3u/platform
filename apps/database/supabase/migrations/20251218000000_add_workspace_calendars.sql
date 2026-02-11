-- Migration: Add workspace_calendars table and calendar source architecture
-- Part 1 of 2: Create workspace_calendars table with system calendar provisioning

-- Create calendar_type enum for type safety
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workspace_calendar_type') THEN
    CREATE TYPE public.workspace_calendar_type AS ENUM ('primary', 'tasks', 'habits', 'custom');
  END IF;
END $$;

-- Create calendar_provider enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calendar_provider') THEN
    CREATE TYPE public.calendar_provider AS ENUM ('tuturuuu', 'google', 'microsoft');
  END IF;
END $$;

-- Create scheduling_source enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calendar_scheduling_source') THEN
    CREATE TYPE public.calendar_scheduling_source AS ENUM ('manual', 'task', 'habit');
  END IF;
END $$;

-- Main workspace_calendars table
CREATE TABLE IF NOT EXISTS public.workspace_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT REFERENCES public.calendar_event_colors(value),
  
  -- Calendar type: primary, tasks, habits, custom
  calendar_type public.workspace_calendar_type NOT NULL DEFAULT 'custom',
  
  -- System calendars (primary, tasks, habits) cannot be deleted
  is_system BOOLEAN NOT NULL DEFAULT false,
  
  -- Whether events from this calendar are shown
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  
  -- Display order
  position INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint: only one of each system calendar type per workspace
CREATE UNIQUE INDEX IF NOT EXISTS workspace_calendars_system_type_unique 
  ON public.workspace_calendars (ws_id, calendar_type) 
  WHERE calendar_type IN ('primary', 'tasks', 'habits');

-- Index for efficient workspace lookups
CREATE INDEX IF NOT EXISTS workspace_calendars_ws_id_idx 
  ON public.workspace_calendars (ws_id);

-- Index for enabled calendars
CREATE INDEX IF NOT EXISTS workspace_calendars_enabled_idx 
  ON public.workspace_calendars (ws_id, is_enabled) 
  WHERE is_enabled = true;

-- Enable RLS
ALTER TABLE public.workspace_calendars ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view calendars in workspaces they belong to
CREATE POLICY "workspace_calendars_select" ON public.workspace_calendars
  FOR SELECT USING (
    ws_id IN (
      SELECT ws_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Users can insert calendars in workspaces they belong to
CREATE POLICY "workspace_calendars_insert" ON public.workspace_calendars
  FOR INSERT WITH CHECK (
    ws_id IN (
      SELECT ws_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Users can update calendars in workspaces they belong to
CREATE POLICY "workspace_calendars_update" ON public.workspace_calendars
  FOR UPDATE USING (
    ws_id IN (
      SELECT ws_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Users can delete non-system calendars in workspaces they belong to
CREATE POLICY "workspace_calendars_delete" ON public.workspace_calendars
  FOR DELETE USING (
    is_system = false AND
    ws_id IN (
      SELECT ws_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Function to create system calendars for a workspace
CREATE OR REPLACE FUNCTION public.create_workspace_system_calendars()
RETURNS TRIGGER AS $$
BEGIN
  -- Create primary calendar
  INSERT INTO public.workspace_calendars (ws_id, name, description, color, calendar_type, is_system, position)
  VALUES (
    NEW.id, 
    'Primary', 
    'Default calendar for events', 
    'BLUE', 
    'primary', 
    true, 
    0
  );
  
  -- Create tasks calendar
  INSERT INTO public.workspace_calendars (ws_id, name, description, color, calendar_type, is_system, position)
  VALUES (
    NEW.id, 
    'Tasks', 
    'Smart scheduled tasks', 
    'PURPLE', 
    'tasks', 
    true, 
    1
  );
  
  -- Create habits calendar
  INSERT INTO public.workspace_calendars (ws_id, name, description, color, calendar_type, is_system, position)
  VALUES (
    NEW.id, 
    'Habits', 
    'Habit instances', 
    'GREEN', 
    'habits', 
    true, 
    2
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create system calendars on workspace creation
DROP TRIGGER IF EXISTS create_system_calendars_on_workspace ON public.workspaces;
CREATE TRIGGER create_system_calendars_on_workspace
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.create_workspace_system_calendars();

-- Provision system calendars for existing workspaces that don't have them
INSERT INTO public.workspace_calendars (ws_id, name, description, color, calendar_type, is_system, position)
SELECT 
  w.id,
  'Primary',
  'Default calendar for events',
  'BLUE',
  'primary',
  true,
  0
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_calendars wc 
  WHERE wc.ws_id = w.id AND wc.calendar_type = 'primary'
);

INSERT INTO public.workspace_calendars (ws_id, name, description, color, calendar_type, is_system, position)
SELECT 
  w.id,
  'Tasks',
  'Smart scheduled tasks',
  'PURPLE',
  'tasks',
  true,
  1
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_calendars wc 
  WHERE wc.ws_id = w.id AND wc.calendar_type = 'tasks'
);

INSERT INTO public.workspace_calendars (ws_id, name, description, color, calendar_type, is_system, position)
SELECT 
  w.id,
  'Habits',
  'Habit instances',
  'GREEN',
  'habits',
  true,
  2
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_calendars wc 
  WHERE wc.ws_id = w.id AND wc.calendar_type = 'habits'
);
