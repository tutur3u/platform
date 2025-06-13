ALTER TABLE public.workspaces
ALTER COLUMN preset
SET DEFAULT 'GENERAL';
-- Drop the workspaces_preset_fkey if it exists
ALTER TABLE public.workspaces DROP CONSTRAINT IF EXISTS workspaces_preset_fkey;
ALTER TABLE public.workspaces
ADD CONSTRAINT workspaces_preset_fkey FOREIGN KEY (preset) REFERENCES public.workspace_presets(name);
ALTER TABLE public.workspaces
ALTER COLUMN preset
SET NOT NULL;