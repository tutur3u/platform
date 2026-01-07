-- Workforce Management & Payroll System Tables
-- Creates tables for contracts, compensation, benefits, and payroll tracking

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Add new permissions to the workspace_role_permission enum
ALTER TYPE "public"."workspace_role_permission" ADD VALUE IF NOT EXISTS 'manage_workforce';
ALTER TYPE "public"."workspace_role_permission" ADD VALUE IF NOT EXISTS 'manage_payroll';
ALTER TYPE "public"."workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_workforce';
ALTER TYPE "public"."workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_payroll';

-- ENUMS
-- ============================================================================

-- Contract type enum
CREATE TYPE workforce_contract_type AS ENUM (
    'full_time',
    'part_time',
    'contractor',
    'intern',
    'temporary'
);

-- Employment status enum
CREATE TYPE workforce_employment_status AS ENUM (
    'active',
    'on_leave',
    'terminated',
    'rehired'
);

-- Payment frequency enum
CREATE TYPE workforce_payment_frequency AS ENUM (
    'weekly',
    'bi_weekly',
    'monthly',
    'annual'
);

-- Benefit type enum
CREATE TYPE workforce_benefit_type AS ENUM (
    'health_insurance',
    'dental_insurance',
    'vision_insurance',
    'life_insurance',
    'retirement_401k',
    'stipend_transport',
    'stipend_meal',
    'stipend_phone',
    'stipend_remote',
    'bonus_performance',
    'bonus_signing',
    'bonus_holiday',
    'leave_vacation',
    'leave_sick',
    'other'
);

-- Payroll run status enum
CREATE TYPE payroll_run_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'finalized',
    'cancelled'
);

-- ============================================================================
-- TABLES
-- ============================================================================

-- 1. workforce_contracts: Multi-term employment contracts
CREATE TABLE "public"."workforce_contracts" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "ws_id" uuid NOT NULL,
    "user_id" uuid NOT NULL, -- FK to workspace_users
    "contract_type" workforce_contract_type NOT NULL DEFAULT 'full_time',
    "employment_status" workforce_employment_status NOT NULL DEFAULT 'active',
    "job_title" text,
    "department" text,
    "working_location" text,
    "start_date" date NOT NULL,
    "end_date" date,
    "file_url" text, -- Path to contract document in storage
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "workforce_contracts_pkey" PRIMARY KEY ("id")
);

-- 2. workforce_compensation: Salary and rate configuration per contract
CREATE TABLE "public"."workforce_compensation" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "ws_id" uuid NOT NULL,
    "contract_id" uuid NOT NULL,
    "base_salary_monthly" numeric(15,2),
    "base_salary_annual" numeric(15,2),
    "base_hourly_rate" numeric(10,2),
    "currency" text NOT NULL DEFAULT 'VND',
    "payment_frequency" workforce_payment_frequency NOT NULL DEFAULT 'monthly',
    -- Overtime configuration
    "overtime_threshold_daily_hours" numeric(4,2) DEFAULT 8,
    "overtime_multiplier_daily" numeric(4,2) DEFAULT 1.5,
    "overtime_multiplier_weekend" numeric(4,2) DEFAULT 2.0,
    "overtime_multiplier_holiday" numeric(4,2) DEFAULT 3.0,
    -- Effective dates for rate changes
    "effective_from" date NOT NULL,
    "effective_until" date,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "workforce_compensation_pkey" PRIMARY KEY ("id")
);

-- 3. workforce_benefits: Recurring and one-off benefits
CREATE TABLE "public"."workforce_benefits" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "ws_id" uuid NOT NULL,
    "contract_id" uuid NOT NULL,
    "benefit_type" workforce_benefit_type NOT NULL,
    "name" text NOT NULL, -- Custom name for the benefit
    "amount" numeric(15,2) NOT NULL,
    "currency" text NOT NULL DEFAULT 'VND',
    "is_recurring" boolean NOT NULL DEFAULT true,
    "recurrence_period" workforce_payment_frequency, -- NULL if not recurring
    "effective_from" date NOT NULL,
    "effective_until" date,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "workforce_benefits_pkey" PRIMARY KEY ("id")
);

-- 4. payroll_runs: Period-based payroll snapshots
CREATE TABLE "public"."payroll_runs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "ws_id" uuid NOT NULL,
    "name" text NOT NULL, -- e.g., "January 2026 Payroll"
    "period_start" date NOT NULL,
    "period_end" date NOT NULL,
    "status" payroll_run_status NOT NULL DEFAULT 'draft',
    "total_gross_amount" numeric(18,2) DEFAULT 0,
    "total_deductions" numeric(18,2) DEFAULT 0,
    "total_net_amount" numeric(18,2) DEFAULT 0,
    "currency" text NOT NULL DEFAULT 'VND',
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "created_by" uuid,
    "approved_at" timestamp with time zone,
    "approved_by" uuid,
    "finalized_at" timestamp with time zone,
    "finalized_by" uuid,
    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- 5. payroll_run_items: Individual payroll entries per user per run
CREATE TABLE "public"."payroll_run_items" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "ws_id" uuid NOT NULL,
    "run_id" uuid NOT NULL,
    "user_id" uuid NOT NULL, -- FK to workspace_users
    "contract_id" uuid, -- FK to workforce_contracts
    -- Time tracking integration
    "regular_hours" numeric(8,2) DEFAULT 0,
    "overtime_hours" numeric(8,2) DEFAULT 0,
    "hourly_rate" numeric(10,2),
    -- Calculated amounts
    "base_pay" numeric(15,2) DEFAULT 0,
    "hourly_pay" numeric(15,2) DEFAULT 0,
    "overtime_pay" numeric(15,2) DEFAULT 0,
    "benefits_total" numeric(15,2) DEFAULT 0,
    "bonuses_total" numeric(15,2) DEFAULT 0,
    "gross_pay" numeric(15,2) DEFAULT 0,
    "deductions_total" numeric(15,2) DEFAULT 0,
    "net_pay" numeric(15,2) DEFAULT 0,
    -- Manual adjustments
    "adjustments" jsonb DEFAULT '[]'::jsonb, -- Array of {description, amount}
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "payroll_run_items_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

-- workforce_contracts
ALTER TABLE "public"."workforce_contracts"
    ADD CONSTRAINT "workforce_contracts_ws_id_fkey" 
    FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "public"."workforce_contracts"
    ADD CONSTRAINT "workforce_contracts_user_id_fkey" 
    FOREIGN KEY (user_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "public"."workforce_contracts"
    ADD CONSTRAINT "workforce_contracts_created_by_fkey" 
    FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- workforce_compensation
ALTER TABLE "public"."workforce_compensation"
    ADD CONSTRAINT "workforce_compensation_ws_id_fkey" 
    FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "public"."workforce_compensation"
    ADD CONSTRAINT "workforce_compensation_contract_id_fkey" 
    FOREIGN KEY (contract_id) REFERENCES workforce_contracts(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- workforce_benefits
ALTER TABLE "public"."workforce_benefits"
    ADD CONSTRAINT "workforce_benefits_ws_id_fkey" 
    FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "public"."workforce_benefits"
    ADD CONSTRAINT "workforce_benefits_contract_id_fkey" 
    FOREIGN KEY (contract_id) REFERENCES workforce_contracts(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- payroll_runs
ALTER TABLE "public"."payroll_runs"
    ADD CONSTRAINT "payroll_runs_ws_id_fkey" 
    FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "public"."payroll_runs"
    ADD CONSTRAINT "payroll_runs_created_by_fkey" 
    FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "public"."payroll_runs"
    ADD CONSTRAINT "payroll_runs_approved_by_fkey" 
    FOREIGN KEY (approved_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "public"."payroll_runs"
    ADD CONSTRAINT "payroll_runs_finalized_by_fkey" 
    FOREIGN KEY (finalized_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- payroll_run_items
ALTER TABLE "public"."payroll_run_items"
    ADD CONSTRAINT "payroll_run_items_ws_id_fkey" 
    FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "public"."payroll_run_items"
    ADD CONSTRAINT "payroll_run_items_run_id_fkey" 
    FOREIGN KEY (run_id) REFERENCES payroll_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "public"."payroll_run_items"
    ADD CONSTRAINT "payroll_run_items_user_id_fkey" 
    FOREIGN KEY (user_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "public"."payroll_run_items"
    ADD CONSTRAINT "payroll_run_items_contract_id_fkey" 
    FOREIGN KEY (contract_id) REFERENCES workforce_contracts(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX "workforce_contracts_ws_id_idx" ON "public"."workforce_contracts" (ws_id);
CREATE INDEX "workforce_contracts_user_id_idx" ON "public"."workforce_contracts" (user_id);
CREATE INDEX "workforce_contracts_status_idx" ON "public"."workforce_contracts" (employment_status);

CREATE INDEX "workforce_compensation_ws_id_idx" ON "public"."workforce_compensation" (ws_id);
CREATE INDEX "workforce_compensation_contract_id_idx" ON "public"."workforce_compensation" (contract_id);
CREATE INDEX "workforce_compensation_effective_idx" ON "public"."workforce_compensation" (effective_from, effective_until);

CREATE INDEX "workforce_benefits_ws_id_idx" ON "public"."workforce_benefits" (ws_id);
CREATE INDEX "workforce_benefits_contract_id_idx" ON "public"."workforce_benefits" (contract_id);

CREATE INDEX "payroll_runs_ws_id_idx" ON "public"."payroll_runs" (ws_id);
CREATE INDEX "payroll_runs_period_idx" ON "public"."payroll_runs" (period_start, period_end);
CREATE INDEX "payroll_runs_status_idx" ON "public"."payroll_runs" (status);

CREATE INDEX "payroll_run_items_ws_id_idx" ON "public"."payroll_run_items" (ws_id);
CREATE INDEX "payroll_run_items_run_id_idx" ON "public"."payroll_run_items" (run_id);
CREATE INDEX "payroll_run_items_user_id_idx" ON "public"."payroll_run_items" (user_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE "public"."workforce_contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workforce_compensation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workforce_benefits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payroll_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payroll_run_items" ENABLE ROW LEVEL SECURITY;

-- Workforce contracts policies
CREATE POLICY "wf_contracts_select"
ON "public"."workforce_contracts" FOR SELECT TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "wf_contracts_insert"
ON "public"."workforce_contracts" FOR INSERT TO authenticated
WITH CHECK (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "wf_contracts_update"
ON "public"."workforce_contracts" FOR UPDATE TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
)
WITH CHECK (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "wf_contracts_delete"
ON "public"."workforce_contracts" FOR DELETE TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

-- Workforce compensation policies
CREATE POLICY "wf_compensation_select"
ON "public"."workforce_compensation" FOR SELECT TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "wf_compensation_insert"
ON "public"."workforce_compensation" FOR INSERT TO authenticated
WITH CHECK (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "wf_compensation_update"
ON "public"."workforce_compensation" FOR UPDATE TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
)
WITH CHECK (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "wf_compensation_delete"
ON "public"."workforce_compensation" FOR DELETE TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

-- Workforce benefits policies
CREATE POLICY "wf_benefits_select"
ON "public"."workforce_benefits" FOR SELECT TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "wf_benefits_insert"
ON "public"."workforce_benefits" FOR INSERT TO authenticated
WITH CHECK (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "wf_benefits_update"
ON "public"."workforce_benefits" FOR UPDATE TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
)
WITH CHECK (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

CREATE POLICY "wf_benefits_delete"
ON "public"."workforce_benefits" FOR DELETE TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workforce')
);

-- Payroll runs policies
CREATE POLICY "payroll_runs_select"
ON "public"."payroll_runs" FOR SELECT TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_payroll')
);

CREATE POLICY "payroll_runs_insert"
ON "public"."payroll_runs" FOR INSERT TO authenticated
WITH CHECK (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_payroll')
);

CREATE POLICY "payroll_runs_update"
ON "public"."payroll_runs" FOR UPDATE TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_payroll')
)
WITH CHECK (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_payroll')
);

CREATE POLICY "payroll_runs_delete"
ON "public"."payroll_runs" FOR DELETE TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_payroll')
);

-- Payroll run items policies
CREATE POLICY "payroll_items_select"
ON "public"."payroll_run_items" FOR SELECT TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_payroll')
);

CREATE POLICY "payroll_items_insert"
ON "public"."payroll_run_items" FOR INSERT TO authenticated
WITH CHECK (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_payroll')
);

CREATE POLICY "payroll_items_update"
ON "public"."payroll_run_items" FOR UPDATE TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_payroll')
)
WITH CHECK (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_payroll')
);

CREATE POLICY "payroll_items_delete"
ON "public"."payroll_run_items" FOR DELETE TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_payroll')
);

-- Self-service: Allow users to view their own payroll items
CREATE POLICY "payroll_items_self_select"
ON "public"."payroll_run_items" FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM workspace_user_linked_users wul
        WHERE wul.virtual_user_id = payroll_run_items.user_id
        AND wul.platform_user_id = auth.uid()
        AND wul.ws_id = payroll_run_items.ws_id
    )
);

-- Self-service: Allow users to view their own contracts
CREATE POLICY "wf_contracts_self_select"
ON "public"."workforce_contracts" FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM workspace_user_linked_users wul
        WHERE wul.virtual_user_id = workforce_contracts.user_id
        AND wul.platform_user_id = auth.uid()
        AND wul.ws_id = workforce_contracts.ws_id
    )
);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_workforce_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workforce_contracts_updated_at
    BEFORE UPDATE ON workforce_contracts
    FOR EACH ROW
    EXECUTE FUNCTION update_workforce_updated_at();

CREATE TRIGGER workforce_compensation_updated_at
    BEFORE UPDATE ON workforce_compensation
    FOR EACH ROW
    EXECUTE FUNCTION update_workforce_updated_at();

CREATE TRIGGER workforce_benefits_updated_at
    BEFORE UPDATE ON workforce_benefits
    FOR EACH ROW
    EXECUTE FUNCTION update_workforce_updated_at();

CREATE TRIGGER payroll_run_items_updated_at
    BEFORE UPDATE ON payroll_run_items
    FOR EACH ROW
    EXECUTE FUNCTION update_workforce_updated_at();
