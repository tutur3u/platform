-- Add more benefit types for Vietnamese workforce
-- Includes social insurance (bảo hiểm xã hội), external services (Grab, Google Workspace), and common allowances

-- 1. Expand Benefit Types
ALTER TYPE workforce_benefit_type ADD VALUE IF NOT EXISTS 'social_insurance';
ALTER TYPE workforce_benefit_type ADD VALUE IF NOT EXISTS 'grab_for_business';
ALTER TYPE workforce_benefit_type ADD VALUE IF NOT EXISTS 'google_workspace';
ALTER TYPE workforce_benefit_type ADD VALUE IF NOT EXISTS 'software_license';
ALTER TYPE workforce_benefit_type ADD VALUE IF NOT EXISTS 'training_education';
ALTER TYPE workforce_benefit_type ADD VALUE IF NOT EXISTS 'gym_membership';

-- Vietnamese Specific Allowances
ALTER TYPE workforce_benefit_type ADD VALUE IF NOT EXISTS 'allowance_responsibility'; -- Phụ cấp trách nhiệm
ALTER TYPE workforce_benefit_type ADD VALUE IF NOT EXISTS 'allowance_attendance'; -- Phụ cấp chuyên cần
ALTER TYPE workforce_benefit_type ADD VALUE IF NOT EXISTS 'allowance_hazardous'; -- Phụ cấp độc hại
ALTER TYPE workforce_benefit_type ADD VALUE IF NOT EXISTS 'allowance_housing'; -- Phụ cấp nhà ở
ALTER TYPE workforce_benefit_type ADD VALUE IF NOT EXISTS 'allowance_petrol'; -- Phụ cấp xăng xe (if distinct from transport)

-- 2. Enhance Compensation for Insurance
-- In Vietnam and many regions, the salary used for insurance calculation differs from base salary
ALTER TABLE "public"."workforce_compensation" 
ADD COLUMN IF NOT EXISTS "insurance_salary" numeric(15,2);

-- 3. Enhance Payroll Run Items for Detailed Deductions
-- We need to track company costs vs employee deductions separately
ALTER TABLE "public"."payroll_run_items"
ADD COLUMN IF NOT EXISTS "insurance_salary" numeric(15,2), -- Snapshot of insurance salary used for this run
ADD COLUMN IF NOT EXISTS "company_deductions" jsonb DEFAULT '{}'::jsonb, -- Store employer contributions (BHXH 17.5%, etc.)
ADD COLUMN IF NOT EXISTS "employee_deductions" jsonb DEFAULT '{}'::jsonb; -- Store employee deductions (BHXH 8%, etc.)

-- 4. Add Comments for Clarity
COMMENT ON COLUMN "public"."workforce_compensation"."insurance_salary" IS 'Salary used for calculating social insurance premiums. Often different from base salary.';
COMMENT ON COLUMN "public"."payroll_run_items"."company_deductions" IS 'JSON object storing employer contributions (e.g., {"social_insurance": 1000, "health_insurance": 200})';
COMMENT ON COLUMN "public"."payroll_run_items"."employee_deductions" IS 'JSON object storing employee deductions (e.g., {"social_insurance": 500, "health_insurance": 100})';
