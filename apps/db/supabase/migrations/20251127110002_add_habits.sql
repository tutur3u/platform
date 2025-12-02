-- Migration: Add Habits Support
-- Description: Creates tables, enums, indexes, and RLS policies for the habits feature

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Recurrence frequency for habits
CREATE TYPE habit_frequency AS ENUM (
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'custom'
);

-- Time of day preference for scheduling
CREATE TYPE time_of_day_preference AS ENUM (
  'morning',    -- 6am-12pm
  'afternoon',  -- 12pm-5pm
  'evening',    -- 5pm-9pm
  'night'       -- 9pm-12am
);

-- Monthly recurrence type
CREATE TYPE monthly_recurrence_type AS ENUM (
  'day_of_month',   -- e.g., 15th of each month
  'day_of_week'     -- e.g., 2nd Tuesday of each month
);

-- ============================================================================
-- TABLES
-- ============================================================================

-- Main habits table
CREATE TABLE workspace_habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Basic info
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT 'BLUE',  -- References calendar_event_colors

  -- Scheduling category (reuses existing calendar_hours enum)
  calendar_hours calendar_hours DEFAULT 'personal_hours',
  priority task_priority DEFAULT 'normal',

  -- Duration constraints (in minutes)
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  min_duration_minutes INTEGER,
  max_duration_minutes INTEGER,

  -- Time preferences
  ideal_time TIME,                           -- Specific time (e.g., 07:00)
  time_preference time_of_day_preference,    -- Or time-of-day range

  -- Recurrence settings
  frequency habit_frequency NOT NULL DEFAULT 'daily',
  recurrence_interval INTEGER DEFAULT 1,     -- Every N days/weeks/months/years

  -- Weekly: which days (0=Sunday, 1=Monday, ..., 6=Saturday)
  days_of_week INTEGER[],

  -- Monthly settings
  monthly_type monthly_recurrence_type,
  day_of_month INTEGER,           -- 1-31 for day_of_month type
  week_of_month INTEGER,          -- 1-5 for day_of_week type (5 = last)
  day_of_week_monthly INTEGER,    -- 0-6 for day_of_week type

  -- Date bounds
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,  -- NULL = no end date

  -- Status
  is_active BOOLEAN DEFAULT true,
  auto_schedule BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Junction table: links habits to their scheduled calendar events
CREATE TABLE habit_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID NOT NULL REFERENCES workspace_habits(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES workspace_calendar_events(id) ON DELETE CASCADE,

  occurrence_date DATE NOT NULL,  -- Which occurrence this event represents
  completed BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(habit_id, event_id)
);

-- Habit completions table for streak tracking
CREATE TABLE habit_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID NOT NULL REFERENCES workspace_habits(id) ON DELETE CASCADE,

  occurrence_date DATE NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Optional: link to calendar event if scheduled
  event_id UUID REFERENCES workspace_calendar_events(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(habit_id, occurrence_date)  -- One completion per occurrence date
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- workspace_habits indexes
CREATE INDEX idx_workspace_habits_ws_id ON workspace_habits(ws_id);
CREATE INDEX idx_workspace_habits_active ON workspace_habits(ws_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_workspace_habits_auto_schedule ON workspace_habits(ws_id, auto_schedule) WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX idx_workspace_habits_creator ON workspace_habits(creator_id) WHERE creator_id IS NOT NULL;

-- habit_calendar_events indexes
CREATE INDEX idx_habit_calendar_events_habit_id ON habit_calendar_events(habit_id);
CREATE INDEX idx_habit_calendar_events_event_id ON habit_calendar_events(event_id);
CREATE INDEX idx_habit_calendar_events_date ON habit_calendar_events(habit_id, occurrence_date);

-- habit_completions indexes
CREATE INDEX idx_habit_completions_habit_id ON habit_completions(habit_id);
CREATE INDEX idx_habit_completions_date ON habit_completions(habit_id, occurrence_date);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE workspace_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_completions ENABLE ROW LEVEL SECURITY;

-- workspace_habits policies
CREATE POLICY "Users can view habits in their workspaces" ON workspace_habits
  FOR SELECT USING (
    ws_id IN (SELECT ws_id FROM workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create habits in their workspaces" ON workspace_habits
  FOR INSERT WITH CHECK (
    ws_id IN (SELECT ws_id FROM workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update habits in their workspaces" ON workspace_habits
  FOR UPDATE USING (
    ws_id IN (SELECT ws_id FROM workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete habits in their workspaces" ON workspace_habits
  FOR DELETE USING (
    ws_id IN (SELECT ws_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- habit_calendar_events policies (access through habit -> workspace)
CREATE POLICY "Users can view habit events in their workspaces" ON habit_calendar_events
  FOR SELECT USING (
    habit_id IN (
      SELECT id FROM workspace_habits WHERE ws_id IN (
        SELECT ws_id FROM workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create habit events in their workspaces" ON habit_calendar_events
  FOR INSERT WITH CHECK (
    habit_id IN (
      SELECT id FROM workspace_habits WHERE ws_id IN (
        SELECT ws_id FROM workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update habit events in their workspaces" ON habit_calendar_events
  FOR UPDATE USING (
    habit_id IN (
      SELECT id FROM workspace_habits WHERE ws_id IN (
        SELECT ws_id FROM workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete habit events in their workspaces" ON habit_calendar_events
  FOR DELETE USING (
    habit_id IN (
      SELECT id FROM workspace_habits WHERE ws_id IN (
        SELECT ws_id FROM workspace_members WHERE user_id = auth.uid()
      )
    )
  );

-- habit_completions policies
CREATE POLICY "Users can view habit completions in their workspaces" ON habit_completions
  FOR SELECT USING (
    habit_id IN (
      SELECT id FROM workspace_habits WHERE ws_id IN (
        SELECT ws_id FROM workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create habit completions in their workspaces" ON habit_completions
  FOR INSERT WITH CHECK (
    habit_id IN (
      SELECT id FROM workspace_habits WHERE ws_id IN (
        SELECT ws_id FROM workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update habit completions in their workspaces" ON habit_completions
  FOR UPDATE USING (
    habit_id IN (
      SELECT id FROM workspace_habits WHERE ws_id IN (
        SELECT ws_id FROM workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete habit completions in their workspaces" ON habit_completions
  FOR DELETE USING (
    habit_id IN (
      SELECT id FROM workspace_habits WHERE ws_id IN (
        SELECT ws_id FROM workspace_members WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at for workspace_habits
CREATE TRIGGER workspace_habits_updated_at
  BEFORE UPDATE ON workspace_habits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at for habit_calendar_events
CREATE TRIGGER habit_calendar_events_updated_at
  BEFORE UPDATE ON habit_calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE workspace_habits IS 'Stores recurring habits that generate calendar events';
COMMENT ON TABLE habit_calendar_events IS 'Links habits to their scheduled calendar events';
COMMENT ON TABLE habit_completions IS 'Tracks habit completions for streak calculation';

COMMENT ON COLUMN workspace_habits.frequency IS 'How often the habit repeats: daily, weekly, monthly, yearly, or custom';
COMMENT ON COLUMN workspace_habits.recurrence_interval IS 'Repeat every N periods (e.g., every 2 weeks)';
COMMENT ON COLUMN workspace_habits.days_of_week IS 'For weekly habits: array of day numbers (0=Sunday to 6=Saturday)';
COMMENT ON COLUMN workspace_habits.monthly_type IS 'For monthly habits: by day of month or by weekday';
COMMENT ON COLUMN workspace_habits.week_of_month IS 'For monthly by weekday: which week (1-5, where 5 means last)';
COMMENT ON COLUMN workspace_habits.ideal_time IS 'Preferred specific time for scheduling this habit';
COMMENT ON COLUMN workspace_habits.time_preference IS 'Preferred time of day if no specific time set';
