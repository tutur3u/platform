-- =============================================
-- Migration: Add Payroll Advanced Features
-- Description: Adds project-specific hourly rates and holiday calendar
-- Created: 2026-01-08
-- =============================================

-- =============================================
-- Table: task_rate_overrides
-- Description: Project-specific hourly rate overrides for users
-- Hierarchy: task_id > project_id > board_id (most specific wins)
-- =============================================

CREATE TABLE IF NOT EXISTS task_rate_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES workspace_users(id) ON DELETE CASCADE,

  -- Scope (at least one must be specified)
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID REFERENCES task_projects(id) ON DELETE CASCADE,
  board_id UUID REFERENCES workspace_boards(id) ON DELETE CASCADE,

  -- Rate configuration
  hourly_rate NUMERIC(10,2) NOT NULL CHECK (hourly_rate >= 0),
  currency TEXT NOT NULL DEFAULT 'VND',

  -- Effective date range (for rate history)
  effective_from DATE NOT NULL,
  effective_until DATE,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_scope CHECK (
    (task_id IS NOT NULL) OR (project_id IS NOT NULL) OR (board_id IS NOT NULL)
  ),
  CONSTRAINT valid_dates CHECK (
    effective_until IS NULL OR effective_until > effective_from
  )
);

-- Indexes for performance
CREATE INDEX idx_task_rate_overrides_ws_id ON task_rate_overrides(ws_id);
CREATE INDEX idx_task_rate_overrides_user_id ON task_rate_overrides(user_id);
CREATE INDEX idx_task_rate_overrides_task_id ON task_rate_overrides(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_task_rate_overrides_project_id ON task_rate_overrides(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_task_rate_overrides_board_id ON task_rate_overrides(board_id) WHERE board_id IS NOT NULL;
CREATE INDEX idx_task_rate_overrides_effective ON task_rate_overrides(effective_from, effective_until);

-- Trigger for updated_at
CREATE TRIGGER set_task_rate_overrides_updated_at
  BEFORE UPDATE ON task_rate_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies
ALTER TABLE task_rate_overrides ENABLE ROW LEVEL SECURITY;

-- Allow workspace members with manage_workforce permission to view rate overrides
CREATE POLICY "task_rate_overrides_select"
ON task_rate_overrides FOR SELECT TO authenticated
USING (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce') OR
  public.has_workspace_permission(ws_id, auth.uid(), 'view_workforce')
);

-- Allow workspace members with manage_workforce permission to manage rate overrides
CREATE POLICY "task_rate_overrides_insert"
ON task_rate_overrides FOR INSERT TO authenticated
WITH CHECK (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "task_rate_overrides_update"
ON task_rate_overrides FOR UPDATE TO authenticated
USING (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "task_rate_overrides_delete"
ON task_rate_overrides FOR DELETE TO authenticated
USING (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

-- =============================================
-- Table: workspace_holidays
-- Description: Holiday calendar for automated overtime detection
-- =============================================

CREATE TABLE IF NOT EXISTS workspace_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Holiday details
  name TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT false,

  -- Overtime configuration
  overtime_multiplier NUMERIC(4,2) NOT NULL DEFAULT 3.0,

  -- Metadata
  country_code TEXT DEFAULT 'VN',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_multiplier CHECK (
    overtime_multiplier >= 1.0 AND overtime_multiplier <= 10.0
  ),
  CONSTRAINT unique_holiday_date UNIQUE (ws_id, holiday_date)
);

-- Indexes for performance
CREATE INDEX idx_workspace_holidays_ws_id ON workspace_holidays(ws_id);
CREATE INDEX idx_workspace_holidays_date ON workspace_holidays(holiday_date);
CREATE INDEX idx_workspace_holidays_country ON workspace_holidays(country_code);

-- Trigger for updated_at
CREATE TRIGGER set_workspace_holidays_updated_at
  BEFORE UPDATE ON workspace_holidays
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies
ALTER TABLE workspace_holidays ENABLE ROW LEVEL SECURITY;

-- Allow all workspace members to view holidays
CREATE POLICY "workspace_holidays_select"
ON workspace_holidays FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.ws_id = workspace_holidays.ws_id
    AND workspace_members.user_id = auth.uid()
  )
);

-- Allow workspace members with manage_workforce permission to manage holidays
CREATE POLICY "workspace_holidays_insert"
ON workspace_holidays FOR INSERT TO authenticated
WITH CHECK (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "workspace_holidays_update"
ON workspace_holidays FOR UPDATE TO authenticated
USING (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "workspace_holidays_delete"
ON workspace_holidays FOR DELETE TO authenticated
USING (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

-- =============================================
-- Function: seed_default_vn_holidays
-- Description: Seeds default Vietnamese public holidays for a workspace
-- Usage: SELECT seed_default_vn_holidays('workspace-uuid-here');
-- =============================================

CREATE OR REPLACE FUNCTION seed_default_vn_holidays(target_ws_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Insert Vietnamese public holidays for 2026
  -- Note: Tết dates are based on lunar calendar and need to be updated annually
  INSERT INTO workspace_holidays (ws_id, name, holiday_date, is_recurring, overtime_multiplier, country_code, notes)
  VALUES
    -- Tết Nguyên Đán (Lunar New Year) - 3 days
    (target_ws_id, 'Tết Nguyên Đán (Ngày 1)', '2026-02-17', false, 3.0, 'VN', 'Lunar New Year Day 1 (Year of the Horse)'),
    (target_ws_id, 'Tết Nguyên Đán (Ngày 2)', '2026-02-18', false, 3.0, 'VN', 'Lunar New Year Day 2'),
    (target_ws_id, 'Tết Nguyên Đán (Ngày 3)', '2026-02-19', false, 3.0, 'VN', 'Lunar New Year Day 3'),

    -- Giỗ Tổ Hùng Vương (Hung Kings'' Festival) - 10th day of 3rd lunar month
    (target_ws_id, 'Giỗ Tổ Hùng Vương', '2026-04-18', false, 3.0, 'VN', 'Hung Kings'' Commemoration Day'),

    -- Ngày Thống Nhất (Reunification Day)
    (target_ws_id, 'Ngày Giải Phóng Miền Nam', '2026-04-30', true, 3.0, 'VN', 'Reunification Day'),

    -- Ngày Quốc Tế Lao Động (International Workers'' Day)
    (target_ws_id, 'Ngày Quốc Tế Lao Động', '2026-05-01', true, 3.0, 'VN', 'International Workers'' Day'),

    -- Ngày Quốc Khánh (National Day)
    (target_ws_id, 'Ngày Quốc Khánh', '2026-09-02', true, 3.0, 'VN', 'National Day of Vietnam')
  ON CONFLICT (ws_id, holiday_date) DO NOTHING;

  RAISE NOTICE 'Successfully seeded Vietnamese public holidays for workspace %', target_ws_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION seed_default_vn_holidays(UUID) TO authenticated;

-- =============================================
-- Comments for documentation
-- =============================================

COMMENT ON TABLE task_rate_overrides IS 'Project-specific hourly rate overrides with hierarchical priority: task > project > board';
COMMENT ON TABLE workspace_holidays IS 'Holiday calendar for automated overtime multiplier detection';
COMMENT ON FUNCTION seed_default_vn_holidays IS 'Seeds default Vietnamese public holidays. Lunar dates (Tết, Hung Kings) need annual updates.';

COMMENT ON COLUMN task_rate_overrides.task_id IS 'Specific task rate override (highest priority)';
COMMENT ON COLUMN task_rate_overrides.project_id IS 'Project-wide rate override (medium priority)';
COMMENT ON COLUMN task_rate_overrides.board_id IS 'Board-wide rate override (lowest priority)';
COMMENT ON COLUMN task_rate_overrides.effective_from IS 'Start date for this rate (allows historical tracking)';
COMMENT ON COLUMN task_rate_overrides.effective_until IS 'End date for this rate (NULL = current/active)';

COMMENT ON COLUMN workspace_holidays.is_recurring IS 'True for fixed-date holidays (e.g., 9/2), false for lunar holidays that change yearly';
COMMENT ON COLUMN workspace_holidays.overtime_multiplier IS 'Multiplier for overtime pay on this holiday (default: 3.0x)';
COMMENT ON COLUMN workspace_holidays.country_code IS 'ISO country code for regional holiday categorization';
