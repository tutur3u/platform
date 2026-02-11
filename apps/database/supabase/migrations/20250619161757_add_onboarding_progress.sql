-- New Onboarding System Migration

-- Create onboarding_progress table to track user onboarding status
CREATE TABLE "public"."onboarding_progress" (
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "completed_steps" text[] NOT NULL DEFAULT '{}',
    "current_step" text NOT NULL DEFAULT 'welcome',
    "workspace_name" text,
    "workspace_description" text,
    "workspace_avatar_url" text,
    "profile_completed" boolean NOT NULL DEFAULT false,
    "tour_completed" boolean NOT NULL DEFAULT false,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "public"."onboarding_progress" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX onboarding_progress_pkey ON public.onboarding_progress USING btree (user_id);
ALTER TABLE "public"."onboarding_progress" ADD CONSTRAINT "onboarding_progress_pkey" PRIMARY KEY using index "onboarding_progress_pkey";

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger to update updated_at on onboarding_progress
CREATE TRIGGER update_onboarding_progress_updated_at 
    BEFORE UPDATE ON public.onboarding_progress 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies
CREATE POLICY "Users can see their own onboarding progress"
ON public.onboarding_progress
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own onboarding progress"
ON public.onboarding_progress
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own onboarding progress"
ON public.onboarding_progress
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Function to check if user is whitelisted
CREATE OR REPLACE FUNCTION public.is_user_whitelisted(user_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.platform_user_roles
        WHERE user_id = user_id_param AND enabled = true
    );
END;
$$;

-- Function to get user whitelist status with role info
CREATE OR REPLACE FUNCTION public.get_user_whitelist_status(user_id_param uuid)
RETURNS TABLE(
    is_whitelisted boolean,
    enabled boolean,
    allow_challenge_management boolean,
    allow_manage_all_challenges boolean,
    allow_role_management boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(pur.enabled, false) as is_whitelisted,
        COALESCE(pur.enabled, false) as enabled,
        COALESCE(pur.allow_challenge_management, false) as allow_challenge_management,
        COALESCE(pur.allow_manage_all_challenges, false) as allow_manage_all_challenges,
        COALESCE(pur.allow_role_management, false) as allow_role_management
    FROM public.platform_user_roles pur
    WHERE pur.user_id = user_id_param;
    
    -- If no record exists, return false for all
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, false, false, false, false;
    END IF;
END;
$$;
