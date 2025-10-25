import {
  ExternalLink,
  Github,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import { memo, useState } from 'react';
import { toast } from '@tuturuuu/ui/sonner';

export interface GitHubIssue {
  id: string;
  owner: string;
  repo: string;
  issue_number: number;
  github_url: string;
  github_title?: string | null;
  github_state?: string | null;
  github_labels?: string[] | null;
  synced_at?: string | null;
}

interface TaskEditGitHubIssueSectionProps {
  linkedIssues: GitHubIssue[];
  isLoading: boolean;
  onAddIssue: (url: string) => Promise<void>;
  onRemoveIssue: (issueId: string) => Promise<void>;
  onSyncIssue: (issueId: string) => Promise<void>;
}

export const TaskEditGitHubIssueSection = memo(
  function TaskEditGitHubIssueSection({
    linkedIssues,
    isLoading,
    onAddIssue,
    onRemoveIssue,
    onSyncIssue,
  }: TaskEditGitHubIssueSectionProps) {
    const [issueUrl, setIssueUrl] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [syncingIssues, setSyncingIssues] = useState<Set<string>>(new Set());

    const handleAddIssue = async () => {
      if (!issueUrl.trim()) {
        toast.error('Please enter a GitHub issue URL');
        return;
      }

      // Basic URL validation
      if (!issueUrl.includes('github.com') || !issueUrl.includes('/issues/')) {
        toast.error('Invalid GitHub issue URL');
        return;
      }

      setIsAdding(true);
      try {
        await onAddIssue(issueUrl);
        setIssueUrl('');
        toast.success('GitHub issue linked successfully');
      } catch (error) {
        console.error('Failed to add GitHub issue:', error);
        toast.error('Failed to link GitHub issue');
      } finally {
        setIsAdding(false);
      }
    };

    const handleSyncIssue = async (issueId: string) => {
      setSyncingIssues((prev) => new Set(prev).add(issueId));
      try {
        await onSyncIssue(issueId);
        toast.success('GitHub issue synced successfully');
      } catch (error) {
        console.error('Failed to sync GitHub issue:', error);
        toast.error('Failed to sync GitHub issue');
      } finally {
        setSyncingIssues((prev) => {
          const next = new Set(prev);
          next.delete(issueId);
          return next;
        });
      }
    };

    const handleRemoveIssue = async (issueId: string) => {
      try {
        await onRemoveIssue(issueId);
        toast.success('GitHub issue unlinked');
      } catch (error) {
        console.error('Failed to remove GitHub issue:', error);
        toast.error('Failed to unlink GitHub issue');
      }
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2 font-medium text-sm">
            <Github className="h-4 w-4" />
            GitHub Issues
          </Label>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Add new GitHub issue */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={issueUrl}
                  onChange={(e) => setIssueUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo/issues/123"
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddIssue();
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddIssue}
                  disabled={isAdding || !issueUrl.trim()}
                  className="gap-1"
                >
                  {isAdding ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  Add
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Paste a GitHub issue URL to link it to this task
              </p>
            </div>

            {/* Linked GitHub issues */}
            {linkedIssues.length > 0 ? (
              <ScrollArea className="max-h-[300px] rounded-md border">
                <div className="space-y-2 p-3">
                  {linkedIssues.map((issue) => {
                    const isSyncing = syncingIssues.has(issue.id);

                    return (
                      <div
                        key={issue.id}
                        className="flex items-start gap-3 rounded-md border bg-card p-3 transition-colors hover:bg-muted/50"
                      >
                        <Github className="mt-0.5 h-4 w-4 text-muted-foreground" />

                        <div className="flex-1 space-y-1 min-w-0">
                          {/* Issue title or URL */}
                          <div className="flex items-start gap-2">
                            <a
                              href={issue.github_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-sm hover:underline flex-1 min-w-0"
                            >
                              {issue.github_title || (
                                <span className="text-muted-foreground">
                                  {issue.owner}/{issue.repo}#
                                  {issue.issue_number}
                                </span>
                              )}
                              <ExternalLink className="ml-1 inline h-3 w-3" />
                            </a>
                          </div>

                          {/* Issue metadata */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground text-xs">
                              {issue.owner}/{issue.repo}#{issue.issue_number}
                            </span>

                            {issue.github_state && (
                              <Badge
                                variant={
                                  issue.github_state === 'open'
                                    ? 'default'
                                    : 'secondary'
                                }
                                className="h-5 text-xs"
                              >
                                {issue.github_state}
                              </Badge>
                            )}

                            {issue.github_labels &&
                              issue.github_labels.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {issue.github_labels
                                    .slice(0, 3)
                                    .map((label) => (
                                      <Badge
                                        key={label}
                                        variant="outline"
                                        className="h-5 text-xs"
                                      >
                                        {label}
                                      </Badge>
                                    ))}
                                  {issue.github_labels.length > 3 && (
                                    <Badge
                                      variant="outline"
                                      className="h-5 text-xs"
                                    >
                                      +{issue.github_labels.length - 3}
                                    </Badge>
                                  )}
                                </div>
                              )}
                          </div>

                          {/* Sync timestamp */}
                          {issue.synced_at && (
                            <p className="text-muted-foreground text-xs">
                              Synced{' '}
                              {new Date(issue.synced_at).toLocaleString(
                                'en-US',
                                {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                }
                              )}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleSyncIssue(issue.id)}
                            disabled={isSyncing}
                            title="Sync from GitHub"
                          >
                            <RefreshCw
                              className={cn(
                                'h-3 w-3',
                                isSyncing && 'animate-spin'
                              )}
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleRemoveIssue(issue.id)}
                            title="Unlink issue"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-center">
                <Github className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-muted-foreground text-sm">
                  No GitHub issues linked yet
                </p>
                <p className="text-muted-foreground text-xs">
                  Add a GitHub issue URL above to get started
                </p>
              </div>
            )}
          </>
        )}
      </div>
    );
  }
);
