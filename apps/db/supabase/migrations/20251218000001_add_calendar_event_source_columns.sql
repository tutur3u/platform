-- Migration: Add calendar source columns to workspace_calendar_events
-- Part 2 of 2: Link events to calendars and add provider abstraction

-- Add new columns to workspace_calendar_events
ALTER TABLE public.workspace_calendar_events
  -- Reference to the source calendar (Tuturuuu calendar or linked external)
  ADD COLUMN IF NOT EXISTS source_calendar_id UUID REFERENCES public.workspace_calendars(id) ON DELETE SET NULL,
  
  -- External calendar reference (for synced events from Google/Microsoft)
  ADD COLUMN IF NOT EXISTS external_calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS external_event_id TEXT,
  
  -- Provider for easier filtering
  ADD COLUMN IF NOT EXISTS provider public.calendar_provider DEFAULT 'tuturuuu',
  
  -- Scheduling source for smart scheduling
  ADD COLUMN IF NOT EXISTS scheduling_source public.calendar_scheduling_source DEFAULT 'manual',
  
  -- Additional metadata for scheduling (task_id, habit_id, recurrence info)
  ADD COLUMN IF NOT EXISTS scheduling_metadata JSONB;

-- Create index for source calendar lookups
CREATE INDEX IF NOT EXISTS workspace_calendar_events_source_calendar_idx 
  ON public.workspace_calendar_events (source_calendar_id);

-- Create index for external event lookups (for sync deduplication)
CREATE INDEX IF NOT EXISTS workspace_calendar_events_external_idx 
  ON public.workspace_calendar_events (ws_id, provider, external_calendar_id, external_event_id);

-- Create index for provider filtering
CREATE INDEX IF NOT EXISTS workspace_calendar_events_provider_idx 
  ON public.workspace_calendar_events (ws_id, provider);

-- Create index for scheduling source
CREATE INDEX IF NOT EXISTS workspace_calendar_events_scheduling_idx 
  ON public.workspace_calendar_events (ws_id, scheduling_source);

-- Add workspace_calendar_id to calendar_connections for linking external calendars
ALTER TABLE public.calendar_connections
  ADD COLUMN IF NOT EXISTS workspace_calendar_id UUID REFERENCES public.workspace_calendars(id) ON DELETE SET NULL;

-- Create index for the connection link
CREATE INDEX IF NOT EXISTS calendar_connections_workspace_calendar_idx 
  ON public.calendar_connections (workspace_calendar_id);

-- Migrate existing Google events: populate provider and external fields from legacy columns
-- This is a data migration that preserves backwards compatibility
UPDATE public.workspace_calendar_events
SET 
  provider = 'google',
  external_calendar_id = google_calendar_id,
  external_event_id = google_event_id
WHERE 
  google_event_id IS NOT NULL 
  AND provider IS NULL;

-- Set provider to 'tuturuuu' for non-external events
UPDATE public.workspace_calendar_events
SET provider = 'tuturuuu'
WHERE provider IS NULL;

-- Link existing events to primary calendar if they don't have a source_calendar_id
-- This ensures all events are linked to a calendar
UPDATE public.workspace_calendar_events e
SET source_calendar_id = (
  SELECT wc.id 
  FROM public.workspace_calendars wc 
  WHERE wc.ws_id = e.ws_id 
    AND wc.calendar_type = 'primary'
  LIMIT 1
)
WHERE e.source_calendar_id IS NULL;

-- Set scheduling_source for task-linked events
UPDATE public.workspace_calendar_events
SET scheduling_source = 'task'
WHERE task_id IS NOT NULL AND scheduling_source IS NULL;

-- Create function to get or create workspace calendar for external provider
-- SECURITY: Uses SECURITY DEFINER to bypass RLS for internal operations,
-- but validates caller using auth.uid() and is_org_member before proceeding
CREATE OR REPLACE FUNCTION public.get_or_create_external_calendar(
  p_ws_id UUID,
  p_calendar_id TEXT,
  p_calendar_name TEXT,
  p_color TEXT,
  p_provider public.calendar_provider
)
RETURNS UUID AS $$
DECLARE
  v_calendar_id UUID;
  v_caller_id UUID;
BEGIN
  -- Set explicit search_path for security
  SET search_path = public, pg_temp;
  
  -- Get the authenticated user
  v_caller_id := auth.uid();
  
  -- Validate caller is authenticated
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: No authenticated user';
  END IF;
  
  -- Validate caller is a member of the workspace
  IF NOT public.is_org_member(v_caller_id, p_ws_id) THEN
    RAISE EXCEPTION 'Forbidden: User is not a member of this workspace';
  END IF;
  
  -- Try to find existing calendar
  SELECT wc.id INTO v_calendar_id
  FROM public.workspace_calendars wc
  JOIN public.calendar_connections cc ON cc.workspace_calendar_id = wc.id
  WHERE cc.ws_id = p_ws_id 
    AND cc.calendar_id = p_calendar_id
    AND cc.provider = p_provider::TEXT
  LIMIT 1;
  
  -- If not found, create one
  IF v_calendar_id IS NULL THEN
    INSERT INTO public.workspace_calendars (ws_id, name, color, calendar_type, is_system, position)
    VALUES (p_ws_id, p_calendar_name, COALESCE(p_color, 'BLUE'), 'custom', false, 100)
    RETURNING id INTO v_calendar_id;
    
    -- Also create the calendar_connections entry so lookups via calendar_id work
    INSERT INTO public.calendar_connections (ws_id, workspace_calendar_id, calendar_id, provider, is_enabled, created_at)
    VALUES (p_ws_id, v_calendar_id, p_calendar_id, p_provider::TEXT, true, NOW());
  END IF;
  
  RETURN v_calendar_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Revoke EXECUTE from public and only allow authenticated users
REVOKE EXECUTE ON FUNCTION public.get_or_create_external_calendar(UUID, TEXT, TEXT, TEXT, public.calendar_provider) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_external_calendar(UUID, TEXT, TEXT, TEXT, public.calendar_provider) TO authenticated;

-- Function to get default calendar for events (primary or by scheduling source)
CREATE OR REPLACE FUNCTION public.get_default_calendar_for_event(
  p_ws_id UUID,
  p_scheduling_source public.calendar_scheduling_source DEFAULT 'manual'
)
RETURNS UUID AS $$
DECLARE
  v_calendar_id UUID;
  v_calendar_type public.workspace_calendar_type;
BEGIN
  -- Map scheduling source to calendar type
  v_calendar_type := CASE p_scheduling_source
    WHEN 'task' THEN 'tasks'::public.workspace_calendar_type
    WHEN 'habit' THEN 'habits'::public.workspace_calendar_type
    ELSE 'primary'::public.workspace_calendar_type
  END;
  
  -- Get the appropriate system calendar
  SELECT id INTO v_calendar_id
  FROM public.workspace_calendars
  WHERE ws_id = p_ws_id AND calendar_type = v_calendar_type
  LIMIT 1;
  
  -- Fallback to primary if not found
  IF v_calendar_id IS NULL THEN
    SELECT id INTO v_calendar_id
    FROM public.workspace_calendars
    WHERE ws_id = p_ws_id AND calendar_type = 'primary'
    LIMIT 1;
  END IF;
  
  RETURN v_calendar_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add comment documenting deprecation of legacy columns
COMMENT ON COLUMN public.workspace_calendar_events.google_calendar_id IS 'DEPRECATED: Use external_calendar_id with provider=google instead';
COMMENT ON COLUMN public.workspace_calendar_events.google_event_id IS 'DEPRECATED: Use external_event_id with provider=google instead';
