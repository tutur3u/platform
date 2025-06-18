# Calendar Sync Coordination

This module provides utilities to coordinate calendar sync operations between active sync (user-initiated) and background sync (automated) to prevent conflicts and ensure data consistency.

## Overview

The calendar sync coordination system uses a `lastUpsert` timestamp to enforce a 30-second cooldown period between sync operations for each workspace. Additionally, it includes a 4-week range check to ensure syncs only operate within a reasonable time window from the current week. This prevents:

- Race conditions between active and background syncs
- Excessive API calls to Google Calendar
- Data inconsistencies from concurrent updates
- Syncs on date ranges too far in the past or future

## Database Schema

The system uses a `workspace_calendar_sync_coordination` table:

```sql
CREATE TABLE workspace_calendar_sync_coordination (
    ws_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    last_upsert TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Functions

### `canProceedWithSync(wsId: string, supabase?: any): Promise<boolean>`

Checks if a sync operation can proceed for the given workspace.

**Parameters:**

- `wsId`: The workspace ID
- `supabase`: Optional Supabase client (will create one if not provided)

**Returns:**

- `true` if sync can proceed (30+ seconds since last upsert)
- `false` if sync is blocked (less than 30 seconds since last upsert)

**Behavior:**

- Creates a coordination record if one doesn't exist for the workspace
- Allows sync for new workspaces (no existing record)
- Gracefully handles errors by allowing sync to proceed

### `isWithin4WeeksFromCurrentWeek(startDate: Date, endDate: Date): boolean`

Checks if a date range is within 4 weeks from the current week.

**Parameters:**

- `startDate`: Start date to check
- `endDate`: End date to check

**Returns:**

- `true` if the date range overlaps with 4 weeks from current week
- `false` if the date range is outside the 4-week window

**Behavior:**

- Uses the current week as the reference point (not the current view)
- Checks if the date range overlaps with the 4-week period
- Useful for preventing syncs on distant past or future dates

### `updateLastUpsert(wsId: string, supabase?: any): Promise<void>`

Updates the `last_upsert` timestamp for a workspace after a successful sync operation.

**Parameters:**

- `wsId`: The workspace ID
- `supabase`: Optional Supabase client (will create one if not provided)

**Behavior:**

- Upserts the timestamp using the workspace ID as the conflict target
- Logs success or error messages
- Gracefully handles errors

### `FOUR_WEEKS_FROM_CURRENT_WEEK`

Constant representing 4 weeks (28 days) from the current week.

## Usage

### Active Sync (use-calendar-sync.tsx)

```typescript
import {
  canProceedWithSync,
  isWithin4WeeksFromCurrentWeek,
  updateLastUpsert,
} from '@tuturuuu/utils/calendar-sync-coordination';

const syncToTuturuuu = async () => {
  // Check if current view is within 4 weeks from current week
  if (dates.length > 0) {
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    if (startDate && endDate) {
      const isWithinRange = isWithin4WeeksFromCurrentWeek(startDate, endDate);

      if (!isWithinRange) {
        console.log(
          'Sync blocked: Current view is outside 4 weeks from current week'
        );
        return;
      }
    }
  }

  // Check if we can proceed with sync
  const canProceed = await canProceedWithSync(wsId);
  if (!canProceed) {
    console.log('Sync blocked due to 30-second cooldown');
    return;
  }

  // Perform sync operations...

  // Update timestamp after successful upsert
  await updateLastUpsert(wsId);
};
```

### Background Sync (google-calendar-background-sync.ts)

```typescript
import {
  FOUR_WEEKS_FROM_CURRENT_WEEK,
  canProceedWithSync,
  updateLastUpsert,
} from '@tuturuuu/utils/calendar-sync-coordination';

const syncGoogleCalendarEvents = async (supabase: any) => {
  for (const token of tokens) {
    // Check if we can proceed with sync for this workspace
    const canProceed = await canProceedWithSync(token.ws_id, supabase);
    if (!canProceed) {
      console.log(
        `Skipping background sync for wsId ${token.ws_id} due to 30-second cooldown`
      );
      continue;
    }

    // Perform sync operations with 4-week range
    const timeMin = new Date();
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + FOUR_WEEKS_FROM_CURRENT_WEEK);

    // ... sync logic ...

    // Update timestamp after successful upsert
    await updateLastUpsert(token.ws_id, supabase);
  }
};
```

## Error Handling

All functions are designed to be fault-tolerant:

- If the coordination table doesn't exist, sync operations are allowed to proceed
- If database operations fail, sync operations are allowed to proceed
- All errors are logged but don't block sync operations
- This ensures the system degrades gracefully if the coordination mechanism fails

## Migration

To set up the coordination table, run the migration:

```sql
-- Create table to coordinate calendar sync operations
CREATE TABLE workspace_calendar_sync_coordination (
    ws_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    last_upsert TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policies and triggers as needed
```

## Benefits

1. **Prevents Conflicts**: Ensures only one sync operation per workspace every 30 seconds
2. **Reduces API Load**: Prevents excessive calls to Google Calendar API
3. **Maintains Consistency**: Avoids race conditions that could corrupt data
4. **Graceful Degradation**: System continues to work even if coordination fails
5. **Workspace Isolation**: Each workspace has its own coordination record
6. **Reasonable Time Window**: Prevents syncs on distant past or future dates
7. **Current Week Reference**: Uses current week as reference point for 4-week window
