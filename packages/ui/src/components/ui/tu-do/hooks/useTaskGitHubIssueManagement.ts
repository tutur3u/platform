import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface GitHubIssue {
  id: string;
  owner: string;
  repo: string;
  issue_number: number;
  github_url: string;
  github_title?: string | null;
  github_state?: string | null;
  github_labels?: string[] | null;
  github_assignees?: string[] | null;
  synced_at?: string | null;
}

interface UseTaskGitHubIssueManagementProps {
  taskId: string;
  workspaceId: string;
  initialIssues?: GitHubIssue[];
}

/**
 * Hook for managing GitHub issue links on a task
 * Provides functions to add, remove, and sync GitHub issues
 */
export function useTaskGitHubIssueManagement({
  taskId,
  workspaceId,
  initialIssues = [],
}: UseTaskGitHubIssueManagementProps) {
  const queryClient = useQueryClient();
  const [linkedIssues, setLinkedIssues] = useState<GitHubIssue[]>(initialIssues);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Parse GitHub issue URL to extract owner, repo, and issue number
   */
  const parseGitHubUrl = useCallback((url: string) => {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname !== 'github.com') {
        throw new Error('Not a GitHub URL');
      }

      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      if (pathParts.length < 4 || pathParts[2] !== 'issues') {
        throw new Error('Invalid GitHub issue URL');
      }

      const owner = pathParts[0];
      const repo = pathParts[1];
      const issueNumber = parseInt(pathParts[3], 10);

      if (!owner || !repo || isNaN(issueNumber)) {
        throw new Error('Invalid GitHub issue URL');
      }

      return { owner, repo, issue_number: issueNumber };
    } catch {
      throw new Error('Invalid GitHub issue URL');
    }
  }, []);

  /**
   * Fetch GitHub issue data from the API and add to task
   */
  const addGitHubIssue = useCallback(
    async (url: string) => {
      const parsed = parseGitHubUrl(url);

      // Fetch issue data from GitHub
      const fetchResponse = await fetch(
        `/api/github/issues/${parsed.owner}/${parsed.repo}/${parsed.issue_number}`
      );

      let issueData = {
        ...parsed,
        github_url: url,
      };

      if (fetchResponse.ok) {
        const data = await fetchResponse.json();
        issueData = {
          ...issueData,
          ...data,
        };
      }

      // Link to task
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/tasks/${taskId}/github-issues`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(issueData),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to link GitHub issue');
      }

      const newIssue = await response.json();
      setLinkedIssues((prev) => [...prev, newIssue]);

      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: ['task-github-issues', taskId],
      });

      return newIssue;
    },
    [taskId, workspaceId, parseGitHubUrl, queryClient]
  );

  /**
   * Remove a GitHub issue link from the task
   */
  const removeGitHubIssue = useCallback(
    async (issueId: string) => {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/tasks/${taskId}/github-issues?issue_id=${issueId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to unlink GitHub issue');
      }

      setLinkedIssues((prev) => prev.filter((issue) => issue.id !== issueId));

      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: ['task-github-issues', taskId],
      });
    },
    [taskId, workspaceId, queryClient]
  );

  /**
   * Sync GitHub issue data from GitHub API
   */
  const syncGitHubIssue = useCallback(
    async (issueId: string) => {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/tasks/${taskId}/github-issues/sync`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ issue_id: issueId }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to sync GitHub issue');
      }

      const updatedIssue = await response.json();
      setLinkedIssues((prev) =>
        prev.map((issue) => (issue.id === issueId ? updatedIssue : issue))
      );

      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: ['task-github-issues', taskId],
      });

      return updatedIssue;
    },
    [taskId, workspaceId, queryClient]
  );

  /**
   * Fetch all GitHub issues for the task
   */
  const fetchGitHubIssues = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/tasks/${taskId}/github-issues`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch GitHub issues');
      }

      const issues = await response.json();
      setLinkedIssues(issues);
      return issues;
    } finally {
      setIsLoading(false);
    }
  }, [taskId, workspaceId]);

  return {
    linkedIssues,
    isLoading,
    addGitHubIssue,
    removeGitHubIssue,
    syncGitHubIssue,
    fetchGitHubIssues,
  };
}
