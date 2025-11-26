-- Migration: Add task_calendar_events junction table for task-to-event linking
-- This enables automatic scheduling of tasks as calendar events

-- Create junction table linking tasks to their scheduled calendar events
CREATE TABLE IF NOT EXISTS task_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES workspace_calendar_events(id) ON DELETE CASCADE,
  scheduled_minutes INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(task_id, event_id)
);

-- Add auto_schedule flag to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_schedule BOOLEAN DEFAULT false;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_task_calendar_events_task_id ON task_calendar_events(task_id);
CREATE INDEX IF NOT EXISTS idx_task_calendar_events_event_id ON task_calendar_events(event_id);
CREATE INDEX IF NOT EXISTS idx_tasks_auto_schedule ON tasks(auto_schedule) WHERE auto_schedule = true;

-- Enable RLS
ALTER TABLE task_calendar_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view task events in their workspaces
CREATE POLICY "Users can view task events in their workspaces"
ON task_calendar_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    LEFT JOIN workspace_boards wb ON t.board_id = wb.id
    LEFT JOIN workspace_members wm ON wb.ws_id = wm.ws_id OR EXISTS (
      SELECT 1 FROM task_lists tl
      JOIN workspace_boards wb2 ON tl.board_id = wb2.id
      JOIN workspace_members wm2 ON wb2.ws_id = wm2.ws_id
      WHERE tl.id = t.list_id AND wm2.user_id = auth.uid()
    )
    WHERE t.id = task_calendar_events.task_id
    AND (wm.user_id = auth.uid() OR wm.user_id IS NULL)
  )
);

-- RLS Policy: Users can insert task events for tasks they have access to
CREATE POLICY "Users can insert task events in their workspaces"
ON task_calendar_events FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tasks t
    LEFT JOIN workspace_boards wb ON t.board_id = wb.id
    LEFT JOIN workspace_members wm ON wb.ws_id = wm.ws_id OR EXISTS (
      SELECT 1 FROM task_lists tl
      JOIN workspace_boards wb2 ON tl.board_id = wb2.id
      JOIN workspace_members wm2 ON wb2.ws_id = wm2.ws_id
      WHERE tl.id = t.list_id AND wm2.user_id = auth.uid()
    )
    WHERE t.id = task_calendar_events.task_id
    AND (wm.user_id = auth.uid() OR wm.user_id IS NULL)
  )
);

-- RLS Policy: Users can update task events in their workspaces
CREATE POLICY "Users can update task events in their workspaces"
ON task_calendar_events FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    LEFT JOIN workspace_boards wb ON t.board_id = wb.id
    LEFT JOIN workspace_members wm ON wb.ws_id = wm.ws_id OR EXISTS (
      SELECT 1 FROM task_lists tl
      JOIN workspace_boards wb2 ON tl.board_id = wb2.id
      JOIN workspace_members wm2 ON wb2.ws_id = wm2.ws_id
      WHERE tl.id = t.list_id AND wm2.user_id = auth.uid()
    )
    WHERE t.id = task_calendar_events.task_id
    AND (wm.user_id = auth.uid() OR wm.user_id IS NULL)
  )
);

-- RLS Policy: Users can delete task events in their workspaces
CREATE POLICY "Users can delete task events in their workspaces"
ON task_calendar_events FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    LEFT JOIN workspace_boards wb ON t.board_id = wb.id
    LEFT JOIN workspace_members wm ON wb.ws_id = wm.ws_id OR EXISTS (
      SELECT 1 FROM task_lists tl
      JOIN workspace_boards wb2 ON tl.board_id = wb2.id
      JOIN workspace_members wm2 ON wb2.ws_id = wm2.ws_id
      WHERE tl.id = t.list_id AND wm2.user_id = auth.uid()
    )
    WHERE t.id = task_calendar_events.task_id
    AND (wm.user_id = auth.uid() OR wm.user_id IS NULL)
  )
);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_task_calendar_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_calendar_events_updated_at
  BEFORE UPDATE ON task_calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION update_task_calendar_events_updated_at();

-- Add task_id column to workspace_calendar_events for direct reference
ALTER TABLE workspace_calendar_events
ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_calendar_events_task_id
ON workspace_calendar_events(task_id) WHERE task_id IS NOT NULL;
