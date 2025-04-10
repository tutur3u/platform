-- Create the architecture project comments table
CREATE TABLE IF NOT EXISTS public.architecture_project_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.workspace_architecture_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX IF NOT EXISTS architecture_project_comments_project_id_idx ON public.architecture_project_comments(project_id);
CREATE INDEX IF NOT EXISTS architecture_project_comments_user_id_idx ON public.architecture_project_comments(user_id);

-- Add RLS policies
ALTER TABLE public.architecture_project_comments ENABLE ROW LEVEL SECURITY;

-- Policy for users to read comments for projects they have access to
CREATE POLICY "Users can read comments for projects they have access to"
ON public.architecture_project_comments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    JOIN public.workspace_architecture_projects wap ON wm.ws_id = wap.ws_id
    WHERE wap.id = project_id AND wm.user_id = auth.uid()
  )
);

-- Policy for users to create comments for projects they have access to
CREATE POLICY "Users can create comments for projects they have access to"
ON public.architecture_project_comments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    JOIN public.workspace_architecture_projects wap ON wm.ws_id = wap.ws_id
    WHERE wap.id = project_id AND wm.user_id = auth.uid()
  ) AND user_id = auth.uid()
);

-- Policy for users to update their own comments
CREATE POLICY "Users can update their own comments"
ON public.architecture_project_comments
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Policy for users to delete their own comments
CREATE POLICY "Users can delete their own comments"
ON public.architecture_project_comments
FOR DELETE
USING (user_id = auth.uid()); 