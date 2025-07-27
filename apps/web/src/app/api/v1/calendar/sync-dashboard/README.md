# Calendar Sync Dashboard API

This API provides endpoints for managing calendar sync dashboard records with proper Row Level Security (RLS) enabled.

## Endpoints

### POST /api/v1/calendar/sync-dashboard/insert

Creates a new calendar sync dashboard record.

**Request Body:**

```json
{
  "ws_id": "uuid",
  "start_time": "2024-01-01T00:00:00Z",
  "end_time": "2024-01-01T00:00:00Z",
  "triggered_by": "uuid",
  "type": "active|manual|background",
  "source": "string",
  "status": "running|completed|failed",
  "inserted_events": 0,
  "updated_events": 0,
  "deleted_events": 0
}
```

**Required Fields:**

- `ws_id`: Workspace ID (UUID)

**Optional Fields:**

- `triggered_by`: User ID who triggered the sync (defaults to current user)
- `start_time`: Sync start time (defaults to current time)
- `end_time`: Sync end time (defaults to current time)
- `type`: Sync type (defaults to "active")
- `status`: Sync status (defaults to "running")
- `inserted_events`: Number of inserted events (defaults to 0)
- `updated_events`: Number of updated events (defaults to 0)
- `deleted_events`: Number of deleted events (defaults to 0)
- `source`: Sync source identifier

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "time": "2024-01-01T00:00:00Z",
    "ws_id": "uuid",
    "triggered_by": "uuid",
    "start_time": "2024-01-01T00:00:00Z",
    "end_time": "2024-01-01T00:00:00Z",
    "type": "active",
    "source": "string",
    "status": "running",
    "inserted_events": 0,
    "updated_events": 0,
    "deleted_events": 0
  }
}
```

### PUT /api/v1/calendar/sync-dashboard/update

Updates an existing calendar sync dashboard record.

**Request Body:**

```json
{
  "id": "uuid",
  "status": "completed",
  "end_time": "2024-01-01T00:00:00Z",
  "inserted_events": 5,
  "updated_events": 3,
  "deleted_events": 1
}
```

**Required Fields:**

- `id`: Record ID to update (UUID)

**Optional Fields:**

- Any field from the calendar_sync_dashboard table schema

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "time": "2024-01-01T00:00:00Z",
    "ws_id": "uuid",
    "triggered_by": "uuid",
    "start_time": "2024-01-01T00:00:00Z",
    "end_time": "2024-01-01T00:00:00Z",
    "type": "active",
    "source": "string",
    "status": "completed",
    "inserted_events": 5,
    "updated_events": 3,
    "deleted_events": 1
  }
}
```

## Authentication

All endpoints require authentication. The user must be authenticated and have access to the workspace specified in the `ws_id` field.

## Row Level Security (RLS)

The API enforces Row Level Security policies:

1. **Read Access**: Users can only read records for workspaces they are members of
2. **Insert Access**: Users can only insert records for workspaces they are members of
3. **Update Access**: Users can only update records for workspaces they are members of

The RLS policies use the `is_org_member(auth.uid(), ws_id)` function to verify workspace membership.

## Error Responses

**401 Unauthorized:**

```json
{
  "error": "User not authenticated"
}
```

**400 Bad Request:**

```json
{
  "error": "ws_id is required"
}
```

**404 Not Found:**

```json
{
  "error": "Sync dashboard record not found"
}
```

**500 Internal Server Error:**

```json
{
  "error": "Failed to insert sync dashboard record",
  "details": "Error message details"
}
```

## Usage Example

```typescript
// Create a new sync record
const insertResponse = await fetch('/api/v1/calendar/sync-dashboard/insert', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    ws_id: 'workspace-uuid',
    type: 'active',
    status: 'running',
  }),
});

const insertData = await insertResponse.json();
const recordId = insertData.data.id;

// Update the sync record
const updateResponse = await fetch('/api/v1/calendar/sync-dashboard/update', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    id: recordId,
    status: 'completed',
    inserted_events: 10,
    updated_events: 5,
    deleted_events: 2,
  }),
});
```

## Testing

A test endpoint is available at `/api/v1/calendar/sync-dashboard/test` to verify the API functionality.
