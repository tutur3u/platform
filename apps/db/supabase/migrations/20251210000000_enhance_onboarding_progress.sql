-- Enhance onboarding_progress table for new adaptive onboarding flow

-- Add new columns for use case and flow type
ALTER TABLE public.onboarding_progress
ADD COLUMN IF NOT EXISTS use_case text,
ADD COLUMN IF NOT EXISTS flow_type text DEFAULT 'personal',
ADD COLUMN IF NOT EXISTS invited_emails text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS theme_preference text,
ADD COLUMN IF NOT EXISTS language_preference text,
ADD COLUMN IF NOT EXISTS notifications_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS team_workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL;

-- Add constraints for valid values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'valid_use_case'
    ) THEN
        ALTER TABLE public.onboarding_progress
        ADD CONSTRAINT valid_use_case CHECK (
            use_case IS NULL OR use_case IN ('personal', 'small_team', 'large_team', 'exploring')
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'valid_flow_type'
    ) THEN
        ALTER TABLE public.onboarding_progress
        ADD CONSTRAINT valid_flow_type CHECK (
            flow_type IN ('personal', 'team')
        );
    END IF;
END $$;

-- Add index for team_workspace_id lookups
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_team_workspace
ON public.onboarding_progress(team_workspace_id)
WHERE team_workspace_id IS NOT NULL;

-- Comment on new columns for documentation
COMMENT ON COLUMN public.onboarding_progress.use_case IS 'User selected use case: personal, small_team, large_team, or exploring';
COMMENT ON COLUMN public.onboarding_progress.flow_type IS 'Onboarding flow type: personal (quick) or team (extended)';
COMMENT ON COLUMN public.onboarding_progress.invited_emails IS 'Array of emails invited during onboarding';
COMMENT ON COLUMN public.onboarding_progress.theme_preference IS 'User theme preference: light, dark, or system';
COMMENT ON COLUMN public.onboarding_progress.language_preference IS 'User language preference: en, vi, etc.';
COMMENT ON COLUMN public.onboarding_progress.notifications_enabled IS 'Whether email notifications are enabled';
COMMENT ON COLUMN public.onboarding_progress.team_workspace_id IS 'Reference to team workspace created during onboarding (distinct from personal workspace)';
