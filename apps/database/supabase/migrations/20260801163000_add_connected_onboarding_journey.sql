-- Expand onboarding from a blocking setup wizard into a replayable, progressive journey.
ALTER TABLE public.onboarding_progress
ADD COLUMN IF NOT EXISTS persona text,
ADD COLUMN IF NOT EXISTS goals text[] NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS completed_missions text[] NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS dismissed_at timestamptz,
ADD COLUMN IF NOT EXISTS replay_app text,
ADD COLUMN IF NOT EXISTS guidance_mode text NOT NULL DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS journey_revision integer NOT NULL DEFAULT 2;

ALTER TABLE public.onboarding_progress
DROP CONSTRAINT IF EXISTS onboarding_progress_persona_check,
ADD CONSTRAINT onboarding_progress_persona_check CHECK (
  persona IS NULL OR persona IN (
    'professional',
    'student',
    'founder',
    'executive',
    'team_leader',
    'educator',
    'creator',
    'developer',
    'operations'
  )
),
DROP CONSTRAINT IF EXISTS onboarding_progress_goals_check,
ADD CONSTRAINT onboarding_progress_goals_check CHECK (
  goals <@ ARRAY['focus', 'collaborate', 'operate', 'learn', 'build']::text[]
),
DROP CONSTRAINT IF EXISTS onboarding_progress_guidance_mode_check,
ADD CONSTRAINT onboarding_progress_guidance_mode_check CHECK (
  guidance_mode IN ('standard', 'employee_test')
),
DROP CONSTRAINT IF EXISTS onboarding_progress_journey_revision_check,
ADD CONSTRAINT onboarding_progress_journey_revision_check CHECK (
  journey_revision > 0
);

COMMENT ON COLUMN public.onboarding_progress.persona IS
  'Optional role or use-case lens used for deterministic app recommendations.';
COMMENT ON COLUMN public.onboarding_progress.goals IS
  'User-selected outcome pathways; empty means the user has not personalized guidance.';
COMMENT ON COLUMN public.onboarding_progress.completed_missions IS
  'Stable mission step ids completed across platform and satellite apps.';
COMMENT ON COLUMN public.onboarding_progress.dismissed_at IS
  'When the user dismissed optional guidance; never used as an access gate.';
COMMENT ON COLUMN public.onboarding_progress.replay_app IS
  'Optional app slug whose guide should replay on the next eligible surface.';
COMMENT ON COLUMN public.onboarding_progress.guidance_mode IS
  'Standard guidance or an isolated employee test session.';
COMMENT ON COLUMN public.onboarding_progress.journey_revision IS
  'Manifest revision last seen by the user, used only to offer new guidance.';
