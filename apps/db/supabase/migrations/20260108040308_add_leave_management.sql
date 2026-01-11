-- Leave Management System Migration
-- Adds leave types, balances, and request tracking with Vietnamese-specific support

-- ==================== ENUMS ====================

-- Leave type categories
CREATE TYPE leave_category AS ENUM (
    'standard',
    'parental',
    'special',
    'custom'
);

-- Leave request status
CREATE TYPE leave_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled',
    'withdrawn'
);

-- ==================== TABLES ====================

-- 1. Leave Types - Configurable leave policies per workspace
CREATE TABLE IF NOT EXISTS leave_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ws_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Type configuration
    name TEXT NOT NULL,
    code TEXT NOT NULL, -- e.g., "ANNUAL", "SICK", "MATERNITY"
    description TEXT,
    color TEXT DEFAULT '#3b82f6', -- Dynamic color token reference
    icon TEXT DEFAULT 'calendar-days', -- Lucide icon name

    -- Leave policy
    is_paid BOOLEAN NOT NULL DEFAULT true,
    requires_approval BOOLEAN NOT NULL DEFAULT true,
    allow_half_days BOOLEAN NOT NULL DEFAULT true,

    -- Accrual configuration
    accrual_rate_days_per_month NUMERIC(5,2) DEFAULT 0, -- e.g., 1.67 days/month = 20 days/year
    max_balance_days NUMERIC(6,2), -- NULL = unlimited
    max_carryover_days NUMERIC(6,2) DEFAULT 0, -- Carryover to next year

    -- Vietnamese-specific leave types
    is_tet_leave BOOLEAN DEFAULT false, -- Tet holiday leave
    is_wedding_leave BOOLEAN DEFAULT false, -- Wedding leave (3 days by law)
    is_funeral_leave BOOLEAN DEFAULT false, -- Funeral leave (3 days by law)

    -- Categorization
    category leave_category NOT NULL DEFAULT 'custom',

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INT DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_leave_type_code UNIQUE (ws_id, code),
    CONSTRAINT valid_accrual_rate CHECK (accrual_rate_days_per_month >= 0),
    CONSTRAINT valid_max_balance CHECK (max_balance_days IS NULL OR max_balance_days >= 0),
    CONSTRAINT valid_carryover CHECK (max_carryover_days >= 0)
);

-- 2. Leave Balances - Per-employee leave balance tracking
CREATE TABLE IF NOT EXISTS leave_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ws_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES workspace_users(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,

    -- Balance tracking (in days)
    accrued_days NUMERIC(8,2) NOT NULL DEFAULT 0, -- Auto-accrued from policy
    used_days NUMERIC(8,2) NOT NULL DEFAULT 0, -- Consumed by approved requests
    adjusted_days NUMERIC(8,2) NOT NULL DEFAULT 0, -- Manual adjustments (+ or -)

    -- Note: available_days = accrued_days + adjusted_days - used_days (computed in API)

    -- Balance period
    balance_year INT NOT NULL, -- e.g., 2026
    carried_over_days NUMERIC(8,2) DEFAULT 0, -- From previous year

    -- Metadata
    last_accrual_date DATE, -- Last time auto-accrual ran
    notes TEXT, -- Adjustment explanations
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_user_leave_type_year UNIQUE (ws_id, user_id, leave_type_id, balance_year),
    CONSTRAINT valid_balance CHECK (used_days >= 0 AND accrued_days >= 0),
    CONSTRAINT valid_year CHECK (balance_year >= 2020 AND balance_year <= 2100)
);

-- 3. Leave Requests - Leave request records
CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ws_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES workspace_users(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,

    -- Request details
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    duration_days NUMERIC(5,2) NOT NULL, -- Auto-calculated work days (supports 0.5 for half days)

    -- Leave details
    reason TEXT,
    is_half_day_start BOOLEAN DEFAULT false, -- First day is half day
    is_half_day_end BOOLEAN DEFAULT false, -- Last day is half day

    -- Workflow status
    status leave_request_status NOT NULL DEFAULT 'pending',

    -- Approval tracking
    approver_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Manager who approved/rejected
    reviewed_at TIMESTAMPTZ,
    reviewer_comments TEXT,

    -- Attachments
    attachment_urls TEXT[], -- Array of storage URLs (medical certs, etc.)

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_dates CHECK (end_date >= start_date),
    CONSTRAINT valid_duration CHECK (duration_days > 0)
);

-- ==================== INDEXES ====================

-- Leave Types
CREATE INDEX idx_leave_types_ws_id ON leave_types(ws_id);
CREATE INDEX idx_leave_types_active ON leave_types(ws_id, is_active);
CREATE INDEX idx_leave_types_category ON leave_types(category);

-- Leave Balances
CREATE INDEX idx_leave_balances_ws_user ON leave_balances(ws_id, user_id);
CREATE INDEX idx_leave_balances_type ON leave_balances(leave_type_id);
CREATE INDEX idx_leave_balances_year ON leave_balances(balance_year);

-- Leave Requests
CREATE INDEX idx_leave_requests_ws_user ON leave_requests(ws_id, user_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);
CREATE INDEX idx_leave_requests_dates ON leave_requests(start_date, end_date);
CREATE INDEX idx_leave_requests_approver ON leave_requests(approver_id) WHERE approver_id IS NOT NULL;
CREATE INDEX idx_leave_requests_leave_type ON leave_requests(leave_type_id);

-- ==================== FUNCTIONS ====================

-- Function: Calculate leave duration (work days excluding weekends and holidays)
CREATE OR REPLACE FUNCTION calculate_leave_duration(
    p_start_date DATE,
    p_end_date DATE,
    p_ws_id UUID,
    p_is_half_day_start BOOLEAN,
    p_is_half_day_end BOOLEAN
) RETURNS NUMERIC AS $$
DECLARE
    work_days NUMERIC := 0;
    loop_date DATE := p_start_date;
    day_count NUMERIC := 0;
BEGIN
    -- Count work days (excluding weekends and workspace holidays)
    WHILE loop_date <= p_end_date LOOP
        -- Check if it's a weekday (Monday-Friday)
        IF EXTRACT(DOW FROM loop_date) NOT IN (0, 6) THEN -- Not Sunday (0) or Saturday (6)
            -- Check if it's not a holiday
            IF NOT EXISTS (
                SELECT 1 FROM workspace_holidays
                WHERE workspace_holidays.ws_id = p_ws_id
                AND holiday_date = loop_date
            ) THEN
                day_count := day_count + 1;
            END IF;
        END IF;
        loop_date := loop_date + INTERVAL '1 day';
    END LOOP;

    work_days := day_count;

    -- Adjust for half days
    IF p_is_half_day_start THEN
        work_days := work_days - 0.5;
    END IF;
    IF p_is_half_day_end THEN
        work_days := work_days - 0.5;
    END IF;

    -- Ensure minimum 0.5 days
    RETURN GREATEST(work_days, 0.5);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ==================== TRIGGERS ====================

-- Trigger: Auto-update duration_days when dates change
CREATE OR REPLACE FUNCTION update_leave_request_duration()
RETURNS TRIGGER AS $$
BEGIN
    NEW.duration_days := calculate_leave_duration(
        NEW.start_date,
        NEW.end_date,
        NEW.ws_id,
        NEW.is_half_day_start,
        NEW.is_half_day_end
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leave_requests_duration_trigger
BEFORE INSERT OR UPDATE OF start_date, end_date, is_half_day_start, is_half_day_end
ON leave_requests
FOR EACH ROW
EXECUTE FUNCTION update_leave_request_duration();

-- Trigger: Update leave balance when request is approved/cancelled
CREATE OR REPLACE FUNCTION update_leave_balance_on_approval()
RETURNS TRIGGER AS $$
BEGIN
    -- When request is approved, deduct from balance
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        UPDATE leave_balances
        SET
            used_days = used_days + NEW.duration_days,
            updated_at = NOW()
        WHERE ws_id = NEW.ws_id
            AND user_id = NEW.user_id
            AND leave_type_id = NEW.leave_type_id
            AND balance_year = EXTRACT(YEAR FROM NEW.start_date);

        -- If no balance record exists for this year, create one
        IF NOT FOUND THEN
            INSERT INTO leave_balances (
                ws_id,
                user_id,
                leave_type_id,
                balance_year,
                used_days
            ) VALUES (
                NEW.ws_id,
                NEW.user_id,
                NEW.leave_type_id,
                EXTRACT(YEAR FROM NEW.start_date),
                NEW.duration_days
            );
        END IF;
    END IF;

    -- When approved request is cancelled/rejected/withdrawn, restore balance
    IF NEW.status IN ('cancelled', 'rejected', 'withdrawn') AND OLD.status = 'approved' THEN
        UPDATE leave_balances
        SET
            used_days = GREATEST(used_days - NEW.duration_days, 0),
            updated_at = NOW()
        WHERE ws_id = NEW.ws_id
            AND user_id = NEW.user_id
            AND leave_type_id = NEW.leave_type_id
            AND balance_year = EXTRACT(YEAR FROM NEW.start_date);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leave_balance_update_trigger
AFTER UPDATE OF status ON leave_requests
FOR EACH ROW
EXECUTE FUNCTION update_leave_balance_on_approval();

-- Trigger: Update updated_at timestamp
CREATE TRIGGER update_leave_types_updated_at
BEFORE UPDATE ON leave_types
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leave_balances_updated_at
BEFORE UPDATE ON leave_balances
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leave_requests_updated_at
BEFORE UPDATE ON leave_requests
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ==================== RLS POLICIES ====================

-- Enable RLS
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

-- Leave Types Policies
CREATE POLICY "leave_types_select"
ON leave_types FOR SELECT TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'view_workforce')
    OR public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "leave_types_insert"
ON leave_types FOR INSERT TO authenticated
WITH CHECK (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "leave_types_update"
ON leave_types FOR UPDATE TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
)
WITH CHECK (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "leave_types_delete"
ON leave_types FOR DELETE TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

-- Leave Balances Policies
CREATE POLICY "leave_balances_select"
ON leave_balances FOR SELECT TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'view_workforce')
    OR public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "leave_balances_insert"
ON leave_balances FOR INSERT TO authenticated
WITH CHECK (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "leave_balances_update"
ON leave_balances FOR UPDATE TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
)
WITH CHECK (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "leave_balances_delete"
ON leave_balances FOR DELETE TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

-- Leave Requests Policies
CREATE POLICY "leave_requests_select"
ON leave_requests FOR SELECT TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'view_workforce')
    OR public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "leave_requests_insert"
ON leave_requests FOR INSERT TO authenticated
WITH CHECK (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "leave_requests_update"
ON leave_requests FOR UPDATE TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
)
WITH CHECK (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "leave_requests_delete"
ON leave_requests FOR DELETE TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

-- ==================== SEED FUNCTION ====================

-- Function: Seed default leave types for a workspace
CREATE OR REPLACE FUNCTION seed_default_leave_types(p_ws_id UUID)
RETURNS void AS $$
BEGIN
    -- Insert default leave types if they don't exist
    INSERT INTO leave_types (
        ws_id,
        name,
        code,
        description,
        color,
        icon,
        is_paid,
        requires_approval,
        allow_half_days,
        accrual_rate_days_per_month,
        max_balance_days,
        max_carryover_days,
        is_tet_leave,
        is_wedding_leave,
        is_funeral_leave,
        category,
        display_order
    ) VALUES
    -- Standard Leave Types
    (
        p_ws_id,
        'Annual Leave',
        'ANNUAL',
        'Annual vacation leave',
        '#3b82f6',
        'calendar-days',
        true,
        true,
        true,
        1.67, -- 20 days per year
        30,
        5,
        false,
        false,
        false,
        'standard',
        1
    ),
    (
        p_ws_id,
        'Sick Leave',
        'SICK',
        'Medical and health-related leave',
        '#ef4444',
        'heart-pulse',
        true,
        false, -- Usually doesn't require approval
        true,
        0.5, -- 6 days per year
        12,
        0,
        false,
        false,
        false,
        'standard',
        2
    ),
    (
        p_ws_id,
        'Personal Leave',
        'PERSONAL',
        'Personal matters and emergencies',
        '#8b5cf6',
        'user',
        true,
        true,
        true,
        0.42, -- 5 days per year
        10,
        0,
        false,
        false,
        false,
        'standard',
        3
    ),
    -- Parental Leave Types
    (
        p_ws_id,
        'Maternity Leave',
        'MATERNITY',
        'Maternity leave for mothers',
        '#ec4899',
        'baby',
        true,
        true,
        false,
        0, -- Grant full allocation upfront
        180,
        0,
        false,
        false,
        false,
        'parental',
        4
    ),
    (
        p_ws_id,
        'Paternity Leave',
        'PATERNITY',
        'Paternity leave for fathers',
        '#06b6d4',
        'baby',
        true,
        true,
        false,
        0, -- Grant full allocation upfront
        14,
        0,
        false,
        false,
        false,
        'parental',
        5
    ),
    -- Vietnamese-Specific Leave Types
    (
        p_ws_id,
        'Tet Leave',
        'TET',
        'Vietnamese Lunar New Year leave',
        '#f59e0b',
        'party-popper',
        true,
        true,
        false,
        0, -- Special allocation
        7,
        0,
        true,
        false,
        false,
        'special',
        6
    ),
    (
        p_ws_id,
        'Wedding Leave',
        'WEDDING',
        'Leave for own wedding (3 days by Vietnamese law)',
        '#14b8a6',
        'heart',
        true,
        true,
        false,
        0, -- One-time allocation
        3,
        0,
        false,
        true,
        false,
        'special',
        7
    ),
    (
        p_ws_id,
        'Funeral Leave',
        'FUNERAL',
        'Bereavement leave (3 days by Vietnamese law)',
        '#6b7280',
        'flower',
        true,
        true,
        false,
        0, -- One-time allocation
        3,
        0,
        false,
        false,
        true,
        'special',
        8
    )
    ON CONFLICT (ws_id, code) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ==================== COMMENTS ====================

COMMENT ON TABLE leave_types IS 'Configurable leave type definitions per workspace';
COMMENT ON TABLE leave_balances IS 'Per-employee leave balance tracking with accrual and usage';
COMMENT ON TABLE leave_requests IS 'Leave request records with approval workflow';

COMMENT ON FUNCTION calculate_leave_duration IS 'Calculates work days between two dates, excluding weekends and holidays';
COMMENT ON FUNCTION seed_default_leave_types IS 'Seeds default leave types including Vietnamese-specific types for a workspace';
