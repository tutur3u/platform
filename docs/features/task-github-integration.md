# Task GitHub Integration

This feature allows users to link GitHub issues to tasks in the Tuturuuu platform, enabling better integration between project management and development workflows.

## Overview

The GitHub issue linking feature provides:

- **Link GitHub issues to tasks**: Connect tasks to one or more GitHub issues
- **Automatic metadata syncing**: Sync issue state, title, labels, and assignees from GitHub
- **Visual indicators**: Display linked issues on task cards and detail views
- **Bidirectional navigation**: Quick access to GitHub issues from within tasks

## Database Schema

### `task_github_issues` Table

```sql
CREATE TABLE task_github_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,

  -- GitHub issue identification
  owner text NOT NULL,
  repo text NOT NULL,
  issue_number integer NOT NULL,

  -- Synced metadata
  github_state text,
  github_title text,
  github_url text NOT NULL,
  github_labels jsonb DEFAULT '[]'::jsonb,
  github_assignees jsonb DEFAULT '[]'::jsonb,
  github_created_at timestamptz,
  github_updated_at timestamptz,
  github_closed_at timestamptz,

  -- Tracking
  creator_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  synced_at timestamptz,

  UNIQUE(task_id, owner, repo, issue_number)
);
```

**Key Features:**
- Multiple GitHub issues can be linked to a single task
- Automatic cascade deletion when task is deleted
- Unique constraint prevents duplicate links
- Stores synced metadata from GitHub API for offline viewing

## API Endpoints

### List GitHub Issues for a Task

```
GET /api/v1/workspaces/{wsId}/tasks/{taskId}/github-issues
```

**Response:**
```json
[
  {
    "id": "uuid",
    "task_id": "uuid",
    "owner": "tutur3u",
    "repo": "platform",
    "issue_number": 123,
    "github_url": "https://github.com/tutur3u/platform/issues/123",
    "github_title": "Add GitHub integration",
    "github_state": "open",
    "github_labels": ["feature", "enhancement"],
    "github_assignees": ["username"],
    "synced_at": "2025-10-22T12:00:00Z"
  }
]
```

### Link GitHub Issue to Task

```
POST /api/v1/workspaces/{wsId}/tasks/{taskId}/github-issues
```

**Request Body:**
```json
{
  "owner": "tutur3u",
  "repo": "platform",
  "issue_number": 123,
  "github_url": "https://github.com/tutur3u/platform/issues/123",
  "github_title": "Add GitHub integration",
  "github_state": "open",
  "github_labels": ["feature"],
  "github_assignees": ["username"]
}
```

**Response:** Returns the created GitHub issue link object

### Remove GitHub Issue Link

```
DELETE /api/v1/workspaces/{wsId}/tasks/{taskId}/github-issues?issue_id={issueId}
```

**Response:**
```json
{
  "success": true
}
```

### Sync GitHub Issue Data

```
POST /api/v1/workspaces/{wsId}/tasks/{taskId}/github-issues/sync
```

**Request Body:**
```json
{
  "issue_id": "uuid"
}
```

**Response:** Returns the updated GitHub issue link object with fresh data from GitHub API

## UI Components

### TaskEditGitHubIssueSection

A section component for the task edit dialog that allows users to manage GitHub issue links.

**Location:** `packages/ui/src/components/ui/tu-do/shared/task-edit/sections/TaskEditGitHubIssueSection.tsx`

**Usage:**
```tsx
import { TaskEditGitHubIssueSection } from '@tuturuuu/ui/tu-do/shared/task-edit/sections/TaskEditGitHubIssueSection';

<TaskEditGitHubIssueSection
  linkedIssues={githubIssues}
  isLoading={isLoadingIssues}
  onAddIssue={handleAddIssue}
  onRemoveIssue={handleRemoveIssue}
  onSyncIssue={handleSyncIssue}
/>
```

**Features:**
- Add GitHub issues by pasting issue URL
- Display linked issues with metadata
- Sync button to refresh data from GitHub
- Remove button to unlink issues
- Visual state indicators (open/closed)

### TaskGitHubIssuesDisplay

A compact display component for showing GitHub issues on task cards.

**Location:** `packages/ui/src/components/ui/tu-do/shared/task-github-issues-display.tsx`

**Usage:**
```tsx
import { TaskGitHubIssuesDisplay } from '@tuturuuu/ui/tu-do/shared/task-github-issues-display';

<TaskGitHubIssuesDisplay
  issues={task.github_issues}
  maxDisplay={3}
  compact={false}
/>
```

**Props:**
- `issues`: Array of GitHub issue objects
- `maxDisplay`: Maximum number of issues to display (default: 3)
- `compact`: Whether to show compact view (default: false)

## Hooks

### useTaskGitHubIssueManagement

A hook for managing GitHub issue links on a task.

**Location:** `packages/ui/src/components/ui/tu-do/hooks/useTaskGitHubIssueManagement.ts`

**Usage:**
```tsx
import { useTaskGitHubIssueManagement } from '@tuturuuu/ui/tu-do/hooks/useTaskGitHubIssueManagement';

const {
  linkedIssues,
  isLoading,
  addGitHubIssue,
  removeGitHubIssue,
  syncGitHubIssue,
  fetchGitHubIssues,
} = useTaskGitHubIssueManagement({
  taskId: task.id,
  workspaceId: wsId,
  initialIssues: task.github_issues || [],
});
```

**Returns:**
- `linkedIssues`: Array of linked GitHub issues
- `isLoading`: Loading state
- `addGitHubIssue(url)`: Function to add a GitHub issue by URL
- `removeGitHubIssue(issueId)`: Function to remove a GitHub issue link
- `syncGitHubIssue(issueId)`: Function to sync issue data from GitHub
- `fetchGitHubIssues()`: Function to fetch all issues for the task

## Utility Functions

### parseGitHubIssueUrl

Parses a GitHub issue URL and extracts owner, repo, and issue number.

**Location:** `apps/web/src/lib/github/parse-issue-url.ts`

**Usage:**
```tsx
import { parseGitHubIssueUrl } from '@/lib/github/parse-issue-url';

const parsed = parseGitHubIssueUrl('https://github.com/tutur3u/platform/issues/123');
// Returns: { owner: 'tutur3u', repo: 'platform', issue_number: 123 }
```

### fetchGitHubIssueData

Fetches GitHub issue data from the GitHub API.

**Location:** `apps/web/src/lib/github/fetch-issue-data.ts`

**Usage:**
```tsx
import { fetchGitHubIssueData } from '@/lib/github/fetch-issue-data';

const issueData = await fetchGitHubIssueData('tutur3u', 'platform', 123);
```

## Setup and Configuration

### Environment Variables

The following environment variables must be configured for GitHub integration:

```env
NEXT_PUBLIC_GITHUB_APP_ID=your_app_id
NEXT_PUBLIC_GITHUB_APP_PRIVATE_KEY=base64_encoded_private_key
NEXT_PUBLIC_GITHUB_APP_INSTALLATION_ID=your_installation_id
```

### Database Migration

Run the migration to create the `task_github_issues` table:

```bash
bun sb:up  # Apply migration locally
bun sb:typegen  # Generate TypeScript types
```

For production:

```bash
bun sb:push  # USER-ONLY - Push migrations to remote
```

## Security and Permissions

### Row-Level Security (RLS)

The `task_github_issues` table has RLS policies that ensure:
- Users can only view GitHub issue links for tasks in their workspaces
- Users can only create/update/delete links for tasks in their workspaces
- All operations require workspace membership verification

### API Authentication

All API endpoints require:
1. Valid user authentication (via Supabase Auth)
2. Workspace membership verification
3. Task ownership verification (task must belong to the workspace)

## Future Enhancements

Potential improvements for this feature:

1. **Webhook Integration**: Automatically sync issue changes from GitHub webhooks
2. **Bulk Operations**: Link multiple issues at once
3. **Issue Templates**: Create tasks from GitHub issue templates
4. **Bidirectional Sync**: Create GitHub issues from tasks
5. **Pull Request Linking**: Link GitHub pull requests in addition to issues
6. **Comment Sync**: Sync comments between tasks and GitHub issues
7. **Automation Rules**: Auto-link issues based on branch names or commit messages
8. **Analytics**: Track issue resolution times and correlate with task completion

## Troubleshooting

### Common Issues

1. **"GitHub App credentials not configured" error**
   - Ensure all three environment variables are set correctly
   - Verify the private key is properly base64 encoded

2. **"GitHub issue not found or access denied" error**
   - Check that the GitHub App has access to the repository
   - Verify the issue number is correct
   - Ensure the repository is not private without proper permissions

3. **"Failed to link GitHub issue" error**
   - Verify the task exists and user has access
   - Check that the issue URL format is correct
   - Ensure the issue is not already linked to the task

## Examples

### Adding GitHub Issue to Task Edit Dialog

```tsx
import { TaskEditGitHubIssueSection } from '@tuturuuu/ui/tu-do/shared/task-edit/sections/TaskEditGitHubIssueSection';
import { useTaskGitHubIssueManagement } from '@tuturuuu/ui/tu-do/hooks/useTaskGitHubIssueManagement';

function TaskEditDialog({ task, wsId }) {
  const {
    linkedIssues,
    isLoading,
    addGitHubIssue,
    removeGitHubIssue,
    syncGitHubIssue,
  } = useTaskGitHubIssueManagement({
    taskId: task.id,
    workspaceId: wsId,
  });

  return (
    <Dialog>
      <DialogContent>
        {/* Other task edit sections */}

        <TaskEditGitHubIssueSection
          linkedIssues={linkedIssues}
          isLoading={isLoading}
          onAddIssue={addGitHubIssue}
          onRemoveIssue={removeGitHubIssue}
          onSyncIssue={syncGitHubIssue}
        />
      </DialogContent>
    </Dialog>
  );
}
```

### Displaying GitHub Issues on Task Card

```tsx
import { TaskGitHubIssuesDisplay } from '@tuturuuu/ui/tu-do/shared/task-github-issues-display';

function TaskCard({ task }) {
  return (
    <div className="task-card">
      <h3>{task.name}</h3>
      <p>{task.description}</p>

      <TaskGitHubIssuesDisplay
        issues={task.github_issues}
        maxDisplay={2}
      />
    </div>
  );
}
```
