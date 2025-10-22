-- Migration: Add GitHub issue linking support for tasks
-- Description: Allows tasks to be linked to GitHub issues with synced metadata

-- Create task_github_issues table
CREATE TABLE IF NOT EXISTS public.task_github_issues (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,

    -- GitHub issue identification
    owner text NOT NULL,  -- GitHub repository owner/organization
    repo text NOT NULL,   -- GitHub repository name
    issue_number integer NOT NULL CHECK (issue_number > 0),

    -- Synced metadata from GitHub API
    github_state text,  -- 'open' or 'closed'
    github_title text,
    github_url text NOT NULL,  -- Full GitHub issue URL for convenience
    github_labels jsonb DEFAULT '[]'::jsonb,  -- Array of GitHub labels
    github_assignees jsonb DEFAULT '[]'::jsonb,  -- Array of GitHub assignees
    github_created_at timestamptz,  -- When the issue was created on GitHub
    github_updated_at timestamptz,  -- When the issue was last updated on GitHub
    github_closed_at timestamptz,  -- When the issue was closed on GitHub

    -- Tracking and metadata
    creator_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    synced_at timestamptz,  -- Last time we synced metadata from GitHub API

    -- Prevent duplicate links to the same issue
    CONSTRAINT unique_task_github_issue UNIQUE (task_id, owner, repo, issue_number)
);

-- Create indexes for performance
CREATE INDEX idx_task_github_issues_task_id ON public.task_github_issues(task_id);
CREATE INDEX idx_task_github_issues_repo ON public.task_github_issues(owner, repo);
CREATE INDEX idx_task_github_issues_github_state ON public.task_github_issues(github_state);
CREATE INDEX idx_task_github_issues_creator_id ON public.task_github_issues(creator_id);

-- Add comments for documentation
COMMENT ON TABLE public.task_github_issues IS 'Links tasks to GitHub issues with synced metadata';
COMMENT ON COLUMN public.task_github_issues.owner IS 'GitHub repository owner or organization name';
COMMENT ON COLUMN public.task_github_issues.repo IS 'GitHub repository name';
COMMENT ON COLUMN public.task_github_issues.issue_number IS 'GitHub issue number (not the database ID)';
COMMENT ON COLUMN public.task_github_issues.github_state IS 'Current state of the GitHub issue (open/closed)';
COMMENT ON COLUMN public.task_github_issues.synced_at IS 'Timestamp of last successful sync from GitHub API';

-- Enable Row Level Security
ALTER TABLE public.task_github_issues ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view GitHub issue links for tasks in their workspaces
CREATE POLICY "Users can view GitHub issue links in their workspaces"
    ON public.task_github_issues
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.tasks t
            JOIN public.task_lists tl ON t.list_id = tl.id
            JOIN public.workspace_boards wb ON tl.board_id = wb.id
            JOIN public.workspace_members wm ON wb.ws_id = wm.ws_id
            WHERE t.id = task_github_issues.task_id
            AND wm.user_id = auth.uid()
        )
    );

-- RLS Policy: Users can create GitHub issue links for tasks in their workspaces
CREATE POLICY "Users can create GitHub issue links in their workspaces"
    ON public.task_github_issues
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.tasks t
            JOIN public.task_lists tl ON t.list_id = tl.id
            JOIN public.workspace_boards wb ON tl.board_id = wb.id
            JOIN public.workspace_members wm ON wb.ws_id = wm.ws_id
            WHERE t.id = task_github_issues.task_id
            AND wm.user_id = auth.uid()
        )
    );

-- RLS Policy: Users can update GitHub issue links they created or in their workspaces
CREATE POLICY "Users can update GitHub issue links in their workspaces"
    ON public.task_github_issues
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM public.tasks t
            JOIN public.task_lists tl ON t.list_id = tl.id
            JOIN public.workspace_boards wb ON tl.board_id = wb.id
            JOIN public.workspace_members wm ON wb.ws_id = wm.ws_id
            WHERE t.id = task_github_issues.task_id
            AND wm.user_id = auth.uid()
        )
    );

-- RLS Policy: Users can delete GitHub issue links they created or in their workspaces
CREATE POLICY "Users can delete GitHub issue links in their workspaces"
    ON public.task_github_issues
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM public.tasks t
            JOIN public.task_lists tl ON t.list_id = tl.id
            JOIN public.workspace_boards wb ON tl.board_id = wb.id
            JOIN public.workspace_members wm ON wb.ws_id = wm.ws_id
            WHERE t.id = task_github_issues.task_id
            AND wm.user_id = auth.uid()
        )
    );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_task_github_issues_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_github_issues_updated_at
    BEFORE UPDATE ON public.task_github_issues
    FOR EACH ROW
    EXECUTE FUNCTION public.update_task_github_issues_updated_at();
