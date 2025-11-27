-- Migration: Add Unified Scheduling Metadata
-- Description: Creates table to track scheduling runs and status for workspaces

-- ============================================================================
-- SCHEDULING METADATA TABLE
-- ============================================================================

-- Track when unified scheduling was last run for each workspace
CREATE TABLE workspace_scheduling_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Last successful schedule run
  last_scheduled_at TIMESTAMPTZ,

  -- Last schedule run status
  last_status TEXT, -- 'success', 'partial', 'failed'
  last_message TEXT,

  -- Schedule run statistics
  habits_scheduled INTEGER DEFAULT 0,
  tasks_scheduled INTEGER DEFAULT 0,
  events_created INTEGER DEFAULT 0,
  bumped_habits INTEGER DEFAULT 0,

  -- Scheduling window used (days)
  window_days INTEGER DEFAULT 30,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(ws_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_workspace_scheduling_metadata_ws_id
  ON workspace_scheduling_metadata(ws_id);

CREATE INDEX idx_workspace_scheduling_metadata_last_scheduled
  ON workspace_scheduling_metadata(last_scheduled_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE workspace_scheduling_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view scheduling metadata in their workspaces"
  ON workspace_scheduling_metadata
  FOR SELECT USING (
    ws_id IN (SELECT ws_id FROM workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update scheduling metadata in their workspaces"
  ON workspace_scheduling_metadata
  FOR UPDATE USING (
    ws_id IN (SELECT ws_id FROM workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert scheduling metadata in their workspaces"
  ON workspace_scheduling_metadata
  FOR INSERT WITH CHECK (
    ws_id IN (SELECT ws_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- ============================================================================
-- TRIGGER
-- ============================================================================

CREATE TRIGGER workspace_scheduling_metadata_updated_at
  BEFORE UPDATE ON workspace_scheduling_metadata
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- UPSERT FUNCTION FOR SCHEDULING RUNS
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_scheduling_metadata(
  p_ws_id UUID,
  p_status TEXT,
  p_message TEXT,
  p_habits_scheduled INTEGER,
  p_tasks_scheduled INTEGER,
  p_events_created INTEGER,
  p_bumped_habits INTEGER,
  p_window_days INTEGER DEFAULT 30
)
RETURNS workspace_scheduling_metadata
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result workspace_scheduling_metadata;
BEGIN
  INSERT INTO workspace_scheduling_metadata (
    ws_id,
    last_scheduled_at,
    last_status,
    last_message,
    habits_scheduled,
    tasks_scheduled,
    events_created,
    bumped_habits,
    window_days
  ) VALUES (
    p_ws_id,
    NOW(),
    p_status,
    p_message,
    p_habits_scheduled,
    p_tasks_scheduled,
    p_events_created,
    p_bumped_habits,
    p_window_days
  )
  ON CONFLICT (ws_id) DO UPDATE SET
    last_scheduled_at = NOW(),
    last_status = EXCLUDED.last_status,
    last_message = EXCLUDED.last_message,
    habits_scheduled = EXCLUDED.habits_scheduled,
    tasks_scheduled = EXCLUDED.tasks_scheduled,
    events_created = EXCLUDED.events_created,
    bumped_habits = EXCLUDED.bumped_habits,
    window_days = EXCLUDED.window_days,
    updated_at = NOW()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE workspace_scheduling_metadata IS
  'Tracks unified scheduling runs for each workspace';

COMMENT ON COLUMN workspace_scheduling_metadata.last_status IS
  'Status of last schedule run: success, partial (some items failed), or failed';

COMMENT ON COLUMN workspace_scheduling_metadata.bumped_habits IS
  'Number of habit events that were bumped by urgent tasks';

COMMENT ON FUNCTION upsert_scheduling_metadata IS
  'Updates or inserts scheduling metadata after a scheduling run';
