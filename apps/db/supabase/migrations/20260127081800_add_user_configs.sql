-- Migration: Add user_configs table for storing user-level key-value configurations
-- Pattern mirrors workspace_configs for consistency

CREATE TABLE IF NOT EXISTS public.user_configs (
    id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, id)
);

-- Add index for user lookup
CREATE INDEX IF NOT EXISTS idx_user_configs_user_id
    ON public.user_configs(user_id);

-- Enable RLS
ALTER TABLE public.user_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can manage their own configs
CREATE POLICY "Users can manage their own configs" ON public.user_configs
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_user_configs_updated_at
    BEFORE UPDATE ON public.user_configs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE public.user_configs IS 'User-level key-value configuration store (mirrors workspace_configs pattern)';
COMMENT ON COLUMN public.user_configs.id IS 'Configuration key, e.g., EXPAND_SETTINGS_ACCORDIONS';
COMMENT ON COLUMN public.user_configs.value IS 'Configuration value as text (parse as needed)';
