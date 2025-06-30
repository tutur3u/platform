# Google Calendar Sync Tasks

This package contains Google Calendar synchronization functionality with workspace-specific concurrency management. Each workspace gets its own queue to prevent duplicate syncs and enable efficient parallel processing.

## Architecture

The sync has been designed with workspace-level concurrency in mind:

### 1. Immediate Sync (`syncWorkspaceImmediate`)
- **Time Range**: Current time to 1 week from now
- **Interval**: Every 1 minute (orchestrated)
- **Concurrency**: 1 sync per workspace at a time
- **Purpose**: Keeps the immediate future (next 7 days) up-to-date with frequent updates

### 2. Extended Sync (`syncWorkspaceExtended`)
- **Time Range**: 1 week from now to 4 weeks from now (3 weeks after the first week)
- **Interval**: Every 10 minutes (orchestrated)
- **Concurrency**: 1 sync per workspace at a time
- **Purpose**: Syncs events further in the future with less frequent updates

## Concurrency Management

Each workspace has its own queue using `concurrencyKey: ws_id`. This means:
- ✅ Multiple workspaces can sync simultaneously (up to your environment's concurrency limit of 10)
- ✅ If a sync is already running for a workspace, new sync requests for that workspace are queued
- ✅ No duplicate syncs for the same workspace
- ✅ Efficient resource utilization

## Files

- `google-calendar-sync.ts` - Core sync functions for individual workspaces
- `google-calendar-background-sync.ts` - Manual trigger functions and utilities
- `google-calendar-scheduled-tasks.ts` - Trigger.dev scheduled task configurations

## Task Structure

### Orchestrator Tasks (Scheduled)
1. **`googleCalendarImmediateOrchestrator`** - Runs every 1 minute
   - Fetches all workspaces with auth tokens
   - Triggers individual workspace immediate syncs with concurrency keys

2. **`googleCalendarExtendedOrchestrator`** - Runs every 10 minutes
   - Fetches all workspaces with auth tokens
   - Triggers individual workspace extended syncs with concurrency keys

### Worker Tasks (Individual Workspace)
1. **`googleCalendarWorkspaceImmediateSync`** - Handles immediate sync for one workspace
2. **`googleCalendarWorkspaceExtendedSync`** - Handles extended sync for one workspace

## Usage

### Manual Execution for Specific Workspace

```typescript
import { 
  triggerWorkspaceImmediateSync,
  triggerWorkspaceExtendedSync 
} from '@tuturuuu/trigger/google-calendar-background-sync';

// Sync immediate range for specific workspace
const result = await triggerWorkspaceImmediateSync('workspace-123');

// Sync extended range for specific workspace
const result = await triggerWorkspaceExtendedSync('workspace-123');
```

### Manual Execution for All Workspaces

```typescript
import { 
  triggerAllWorkspacesImmediateSync,
  triggerAllWorkspacesExtendedSync 
} from '@tuturuuu/trigger/google-calendar-background-sync';

// Sync all workspaces immediately
const results = await triggerAllWorkspacesImmediateSync();

// Sync all workspaces extended
const results = await triggerAllWorkspacesExtendedSync();
```

### Direct Workspace Sync

```typescript
import { 
  syncWorkspaceImmediate, 
  syncWorkspaceExtended 
} from '@tuturuuu/trigger/google-calendar-sync';

// Direct sync with workspace data
const result = await syncWorkspaceImmediate({
  ws_id: 'workspace-123',
  access_token: 'google-access-token',
  refresh_token: 'google-refresh-token'
});
```

### Scheduled Execution with Trigger.dev

```typescript
import { googleCalendarTasks } from '@tuturuuu/trigger/google-calendar-scheduled-tasks';

// Register all tasks
export const tasks = googleCalendarTasks;
```

## Cron Patterns

- **Immediate Orchestrator**: `* * * * *` (every minute)
- **Extended Orchestrator**: `*/10 * * * *` (every 10 minutes)

## Time Ranges

- **Immediate**: Now → +7 days
- **Extended**: +7 days → +28 days (4 weeks total)

## Concurrency Keys

Each workspace sync uses `concurrencyKey: ws_id`, which means:
- Workspace `ws-123` gets queue `google-calendar-workspace-immediate-sync-ws-123`
- Workspace `ws-456` gets queue `google-calendar-workspace-immediate-sync-ws-456`
- If `ws-123` is syncing, new `ws-123` syncs are queued
- `ws-456` can sync simultaneously with `ws-123`

## Response Format

Sync functions return:
```typescript
{
  ws_id: string;
  success: boolean;
  eventsSynced?: number;
  eventsDeleted?: number;
  error?: string;
}
```

## Configuration

All sync functions use the same environment variables:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

## Database Tables

The sync functions interact with:
- `calendar_auth_tokens` - Stores OAuth tokens for each workspace
- `workspace_calendar_events` - Stores synchronized calendar events

## Backward Compatibility

Legacy functions are still available:
- `syncGoogleCalendarEventsImmediate()` - Syncs all workspaces sequentially
- `syncGoogleCalendarEventsExtended()` - Syncs all workspaces sequentially
- `syncGoogleCalendarEvents()` - Defaults to immediate sync 