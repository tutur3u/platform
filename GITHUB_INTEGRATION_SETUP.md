# GitHub Issue Integration - Setup Instructions

This document provides instructions for completing the setup of the GitHub issue linking feature for tasks.

## What Was Implemented

### 1. Database Schema
- Created migration: `apps/db/supabase/migrations/20251022040000_add_task_github_issues.sql`
- New table: `task_github_issues` with RLS policies
- Supports multiple GitHub issues per task
- Stores synced metadata from GitHub API

### 2. API Endpoints
- `GET /api/v1/workspaces/{wsId}/tasks/{taskId}/github-issues` - List linked issues
- `POST /api/v1/workspaces/{wsId}/tasks/{taskId}/github-issues` - Link an issue
- `DELETE /api/v1/workspaces/{wsId}/tasks/{taskId}/github-issues` - Remove link
- `POST /api/v1/workspaces/{wsId}/tasks/{taskId}/github-issues/sync` - Sync from GitHub

### 3. UI Components
- `TaskEditGitHubIssueSection` - Section for task edit dialog
- `TaskGitHubIssuesDisplay` - Compact display for task cards
- `useTaskGitHubIssueManagement` - React hook for managing issues

### 4. Utilities
- URL parsing and validation
- GitHub API integration
- Metadata syncing

### 5. Documentation
- Comprehensive feature documentation in `docs/features/task-github-integration.md`

## Required Setup Steps

### Step 1: Apply Database Migration

Since the build tools are not available in the current environment, you'll need to apply the migration manually:

```bash
# Apply migration to local database
bun sb:up

# Generate TypeScript types
bun sb:typegen
```

### Step 2: Verify Environment Variables

Ensure these environment variables are configured in your `.env.local`:

```env
NEXT_PUBLIC_GITHUB_APP_ID=your_app_id
NEXT_PUBLIC_GITHUB_APP_PRIVATE_KEY=base64_encoded_private_key
NEXT_PUBLIC_GITHUB_APP_INSTALLATION_ID=your_installation_id
```

Note: These are already being used by the contributors page, so they should be configured.

### Step 3: Integrate UI Components

To add GitHub issue linking to the task edit dialog, you'll need to:

1. **Update the task edit dialog** to include the GitHub issue section:

```tsx
// In packages/ui/src/components/ui/tu-do/shared/task-edit-dialog.tsx
// or the appropriate task edit component

import { TaskEditGitHubIssueSection } from './sections/TaskEditGitHubIssueSection';
import { useTaskGitHubIssueManagement } from '../hooks/useTaskGitHubIssueManagement';

// Inside the component:
const {
  linkedIssues,
  isLoading: isLoadingGitHubIssues,
  addGitHubIssue,
  removeGitHubIssue,
  syncGitHubIssue,
} = useTaskGitHubIssueManagement({
  taskId: task.id,
  workspaceId: wsId,
});

// Add this section in the dialog:
<TaskEditGitHubIssueSection
  linkedIssues={linkedIssues}
  isLoading={isLoadingGitHubIssues}
  onAddIssue={addGitHubIssue}
  onRemoveIssue={removeGitHubIssue}
  onSyncIssue={syncGitHubIssue}
/>
```

2. **Update task cards** to display linked GitHub issues:

```tsx
// In task card components
import { TaskGitHubIssuesDisplay } from '@tuturuuu/ui/tu-do/shared/task-github-issues-display';

// Add to task card:
<TaskGitHubIssuesDisplay
  issues={task.github_issues}
  maxDisplay={2}
  compact={false}
/>
```

3. **Update task queries** to include GitHub issues:

Modify your task queries to include GitHub issues in the SELECT:

```tsx
const { data: tasks } = await supabase
  .from('tasks')
  .select(`
    *,
    github_issues:task_github_issues(*)
  `)
  .eq('id', taskId);
```

### Step 4: Test the Integration

1. **Create a task** in your workspace
2. **Open the task edit dialog**
3. **Add a GitHub issue URL** (e.g., `https://github.com/tutur3u/platform/issues/123`)
4. **Verify the issue is linked** and metadata is displayed
5. **Test syncing** by clicking the refresh button
6. **Test unlinking** by clicking the trash button

### Step 5: Deploy Migration to Production

When ready to deploy to production:

```bash
# IMPORTANT: Only run this when you're ready to deploy
bun sb:push
```

## File Structure

```
apps/
├── db/
│   └── supabase/
│       └── migrations/
│           └── 20251022040000_add_task_github_issues.sql
└── web/
    ├── src/
    │   ├── app/
    │   │   └── api/
    │   │       └── v1/
    │   │           └── workspaces/
    │   │               └── [wsId]/
    │   │                   └── tasks/
    │   │                       └── [taskId]/
    │   │                           └── github-issues/
    │   │                               ├── route.ts
    │   │                               └── sync/
    │   │                                   └── route.ts
    │   └── lib/
    │       └── github/
    │           ├── parse-issue-url.ts
    │           └── fetch-issue-data.ts
packages/
└── ui/
    └── src/
        └── components/
            └── ui/
                └── tu-do/
                    ├── hooks/
                    │   └── useTaskGitHubIssueManagement.ts
                    └── shared/
                        ├── task-edit/
                        │   └── sections/
                        │       └── TaskEditGitHubIssueSection.tsx
                        └── task-github-issues-display.tsx
docs/
└── features/
    └── task-github-integration.md
```

## Integration Points

### Task Type Extension

You may need to extend your Task type to include GitHub issues:

```typescript
// In packages/types/src/primitives/Task.ts or similar
interface Task {
  // ... existing fields
  github_issues?: GitHubIssue[];
}

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
```

## Security Considerations

1. **RLS Policies**: All GitHub issue links are protected by RLS policies that ensure users can only access issues for tasks in their workspaces.

2. **API Authentication**: All API endpoints verify:
   - User authentication
   - Workspace membership
   - Task ownership

3. **GitHub API**: The integration uses the existing GitHub App credentials that are already configured for the contributors page.

## Future Enhancements

Consider implementing these enhancements in the future:

1. **Webhook Integration**: Automatically sync when issues change on GitHub
2. **Bulk Import**: Import multiple issues at once
3. **Issue Creation**: Create GitHub issues from tasks
4. **Pull Request Linking**: Support linking pull requests
5. **Comment Sync**: Sync comments between tasks and issues
6. **Automation**: Auto-link issues based on branch names

## Troubleshooting

### Types Not Available

If TypeScript types are not available after migration:

```bash
bun sb:typegen
```

### API Endpoints Not Working

1. Verify the migration was applied successfully
2. Check environment variables are set
3. Verify GitHub App has access to the repositories
4. Check browser console for detailed error messages

### UI Components Not Showing

1. Ensure imports are correct
2. Verify the task edit dialog is properly updated
3. Check that the hook is initialized with correct parameters

## Questions?

For more details, see:
- Full documentation: `docs/features/task-github-integration.md`
- API implementation: `apps/web/src/app/api/v1/workspaces/[wsId]/tasks/[taskId]/github-issues/`
- UI components: `packages/ui/src/components/ui/tu-do/`

---

**Next Steps:**
1. Run the migration: `bun sb:up && bun sb:typegen`
2. Integrate UI components into task edit dialog
3. Test the feature locally
4. Deploy to production when ready
