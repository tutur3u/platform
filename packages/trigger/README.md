# Google Calendar Sync Tasks

This package contains Google Calendar synchronization functionality split into two separate tasks with different time ranges and intervals.

## Architecture

The sync has been separated into two distinct tasks:

### 1. Immediate Sync (`syncGoogleCalendarEventsImmediate`)
- **Time Range**: Current time to 1 week from now
- **Interval**: Every 1 minute
- **Purpose**: Keeps the immediate future (next 7 days) up-to-date with frequent updates

### 2. Extended Sync (`syncGoogleCalendarEventsExtended`)
- **Time Range**: 1 week from now to 4 weeks from now (3 weeks after the first week)
- **Interval**: Every 10 minutes
- **Purpose**: Syncs events further in the future with less frequent updates

## Files

- `google-calendar-sync.ts` - Core sync functions with time range parameters
- `google-calendar-background-sync.ts` - Background task runners
- `google-calendar-scheduled-tasks.ts` - Trigger.dev scheduled task configurations

## Usage

### Manual Execution

```typescript
import { 
  syncGoogleCalendarEventsImmediate, 
  syncGoogleCalendarEventsExtended 
} from '@tuturuuu/trigger/google-calendar-sync';

// Run immediate sync (1 week from now)
await syncGoogleCalendarEventsImmediate();

// Run extended sync (3 weeks after first week)
await syncGoogleCalendarEventsExtended();
```

### Scheduled Execution with Trigger.dev

```typescript
import { googleCalendarTasks } from '@tuturuuu/trigger/google-calendar-scheduled-tasks';

// Register both tasks
export const tasks = googleCalendarTasks;
```

## Cron Patterns

- **Immediate Sync**: `* * * * *` (every minute)
- **Extended Sync**: `*/10 * * * *` (every 10 minutes)

## Time Ranges

- **Immediate**: Now → +7 days
- **Extended**: +7 days → +28 days (4 weeks total)

## Backward Compatibility

The original `syncGoogleCalendarEvents` function is still available and defaults to the immediate sync behavior for backward compatibility.

## Configuration

Both sync functions use the same environment variables:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

## Database Tables

The sync functions interact with:
- `calendar_auth_tokens` - Stores OAuth tokens for each workspace
- `workspace_calendar_events` - Stores synchronized calendar events 