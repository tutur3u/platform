import { ExternalLink, Github } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { memo } from 'react';

export interface GitHubIssue {
  id: string;
  owner: string;
  repo: string;
  issue_number: number;
  github_url: string;
  github_title?: string | null;
  github_state?: string | null;
}

interface TaskGitHubIssuesDisplayProps {
  issues: GitHubIssue[];
  className?: string;
  maxDisplay?: number;
  compact?: boolean;
}

export const TaskGitHubIssuesDisplay = memo(function TaskGitHubIssuesDisplay({
  issues,
  className,
  maxDisplay = 3,
  compact = false,
}: TaskGitHubIssuesDisplayProps) {
  if (!issues || issues.length === 0) {
    return null;
  }

  const displayedIssues = issues.slice(0, maxDisplay);
  const remainingCount = Math.max(0, issues.length - maxDisplay);

  if (compact) {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        <Github className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground text-xs">
          {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Github className="h-3.5 w-3.5 text-muted-foreground" />

      {displayedIssues.map((issue) => (
        <a
          key={issue.id}
          href={issue.github_url}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 transition-colors hover:bg-muted"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-xs font-medium">
            {issue.owner}/{issue.repo}#{issue.issue_number}
          </span>

          {issue.github_state && (
            <Badge
              variant={issue.github_state === 'open' ? 'default' : 'secondary'}
              className="h-4 px-1.5 text-xs"
            >
              {issue.github_state}
            </Badge>
          )}

          <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </a>
      ))}

      {remainingCount > 0 && (
        <Badge variant="outline" className="h-6 text-xs">
          +{remainingCount} more
        </Badge>
      )}
    </div>
  );
});
