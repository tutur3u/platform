-- Make sure public.workspaces.preset references public.workspace_presets.name and it's not null
-- The default value for it is "GENERAL"
ALTER TABLE public.workspaces
ALTER COLUMN preset
SET DEFAULT 'GENERAL';
ALTER TABLE public.workspaces
ADD CONSTRAINT workspaces_preset_fkey FOREIGN KEY (preset) REFERENCES public.workspace_presets(name);
ALTER TABLE public.workspaces
ALTER COLUMN preset
SET NOT NULL;