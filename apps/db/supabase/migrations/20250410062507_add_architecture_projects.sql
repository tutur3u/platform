-- Create the workspace_architecture_projects table
CREATE TABLE IF NOT EXISTS public.workspace_architecture_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text NOT NULL,
  building_requirements text NOT NULL,
  analysis jsonb,
  status text DEFAULT 'pending',
  ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

-- Add RLS policies
ALTER TABLE public.workspace_architecture_projects ENABLE ROW LEVEL SECURITY;

-- Policy for workspace members
CREATE POLICY workspace_member_architecture_projects ON public.workspace_architecture_projects
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.ws_id = workspace_architecture_projects.ws_id
      AND wm.user_id = auth.uid()
    )
  );

-- Add comments
COMMENT ON TABLE public.workspace_architecture_projects IS 'Stores architecture projects with building regulations analysis';

-- Create functions for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_workspace_architecture_projects_updated_at ON public.workspace_architecture_projects;
CREATE TRIGGER update_workspace_architecture_projects_updated_at
  BEFORE UPDATE ON public.workspace_architecture_projects
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_updated_at(); 