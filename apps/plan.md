# Event Scheduling with Attendee Voting - Implementation Plan

## Overview

This document outlines the implementation plan for adding event scheduling capabilities to the calendar system, including the ability to invite workspace members and have them vote on attendance. Events will only appear in attendees' calendars after they vote "yes".

## Current Database Analysis

### Existing Tables

- **`workspace_calendar_events`**: Basic calendar events with title, description, start/end times, color, location, priority
- **`workspace_members`**: Workspace membership with user_id, ws_id, role, role_title
- **`workspace_meetings`**: Basic meeting structure (minimal - just id, ws_id, name, time, creator_id)
- **`tasks`**: Task management with calendar integration
- **`task_assignees`**: Task assignment relationships

### Existing Functionality

- Calendar event creation and management
- Workspace member management
- Task assignment system
- Poll system (for meet-together plans)
- Time tracking integration

## Required Database Modifications

### 1. New Table: `workspace_scheduled_events`

```sql
CREATE TABLE "public"."workspace_scheduled_events" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "ws_id" uuid NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone NOT NULL,
    "location" text,
    "color" text,
    "creator_id" uuid NOT NULL,
    "is_all_day" boolean DEFAULT false,
    "recurrence_rule" text, -- For recurring events
    "requires_confirmation" boolean DEFAULT true,
    "status" text DEFAULT 'active', -- active, cancelled, completed
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),

    CONSTRAINT "workspace_scheduled_events_pkey" PRIMARY KEY (id),
    CONSTRAINT "workspace_scheduled_events_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    CONSTRAINT "workspace_scheduled_events_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id),
    CONSTRAINT "workspace_scheduled_events_color_fkey" FOREIGN KEY (color) REFERENCES calendar_event_colors(value)
);
```

### 2. New Table: `event_attendees`

```sql
CREATE TABLE "public"."event_attendees" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "event_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "status" text DEFAULT 'pending', -- pending, accepted, declined, tentative
    "response_at" timestamp with time zone,
    "notes" text, -- Optional notes from attendee
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),

    CONSTRAINT "event_attendees_pkey" PRIMARY KEY (id),
    CONSTRAINT "event_attendees_event_id_fkey" FOREIGN KEY (event_id) REFERENCES workspace_scheduled_events(id) ON DELETE CASCADE,
    CONSTRAINT "event_attendees_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT "event_attendees_unique_user_event" UNIQUE (event_id, user_id)
);
```

### 3. New Enum: `event_attendee_status`

```sql
CREATE TYPE "public"."event_attendee_status" AS ENUM (
    'pending',
    'accepted',
    'declined',
    'tentative'
);
```

### 4. New Enum: `event_status`

```sql
CREATE TYPE "public"."event_status" AS ENUM (
    'active',
    'cancelled',
    'completed',
    'draft'
);
```

## Database Indexes and Constraints

### Indexes

```sql
-- Performance indexes for common queries
CREATE INDEX idx_event_attendees_event_id ON event_attendees(event_id);
CREATE INDEX idx_event_attendees_user_id ON event_attendees(user_id);
CREATE INDEX idx_event_attendees_status ON event_attendees(status);
CREATE INDEX idx_workspace_scheduled_events_ws_id ON workspace_scheduled_events(ws_id);
CREATE INDEX idx_workspace_scheduled_events_creator_id ON workspace_scheduled_events(creator_id);
CREATE INDEX idx_workspace_scheduled_events_start_at ON workspace_scheduled_events(start_at);
CREATE INDEX idx_event_invitations_token ON event_invitations(invitation_token);
```

### RLS Policies

```sql
-- Enable RLS on all new tables
ALTER TABLE workspace_scheduled_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_invitations ENABLE ROW LEVEL SECURITY;

-- Policies for workspace_scheduled_events
CREATE POLICY "Workspace members can view events" ON workspace_scheduled_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM workspace_members
            WHERE workspace_members.ws_id = workspace_scheduled_events.ws_id
            AND workspace_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Event creators can manage their events" ON workspace_scheduled_events
    FOR ALL USING (creator_id = auth.uid());

-- Policies for event_attendees
CREATE POLICY "Users can view their own attendance" ON event_attendees
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update their own attendance" ON event_attendees
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Event creators can view all attendees" ON event_attendees
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM workspace_scheduled_events
            WHERE workspace_scheduled_events.id = event_attendees.event_id
            AND workspace_scheduled_events.creator_id = auth.uid()
        )
    );

-- Policies for event_invitations
CREATE POLICY "Users can view invitations sent to them" ON event_invitations
    FOR SELECT USING (invitee_id = auth.uid());

CREATE POLICY "Event creators can manage invitations" ON event_invitations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_scheduled_events
            WHERE workspace_scheduled_events.id = event_invitations.event_id
            AND workspace_scheduled_events.creator_id = auth.uid()
        )
    );
```

## API Endpoints

### 1. Event Management

- `POST /api/[wsId]/events` - Create new event
- `GET /api/[wsId]/events` - List workspace events
- `GET /api/[wsId]/events/[eventId]` - Get event details
- `PUT /api/[wsId]/events/[eventId]` - Update event
- `DELETE /api/[wsId]/events/[eventId]` - Delete event

### 2. Attendee Management

- `POST /api/[wsId]/events/[eventId]/attendees` - Add attendees
- `GET /api/[wsId]/events/[eventId]/attendees` - List attendees
- `PUT /api/[wsId]/events/[eventId]/attendees/[userId]` - Update attendance status
- `DELETE /api/[wsId]/events/[eventId]/attendees/[userId]` - Remove attendee

### 3. Invitation Management

- `POST /api/[wsId]/events/[eventId]/invite` - Send invitations
- `GET /api/events/invite/[token]` - View invitation
- `POST /api/events/invite/[token]/respond` - Respond to invitation
- `GET /api/[wsId]/events/invitations` - List sent invitations

### 4. Calendar Integration

- `GET /api/[wsId]/calendar/events` - Get user's calendar events (only accepted events)
- `GET /api/[wsId]/calendar/pending` - Get pending event invitations

## Frontend Components

### 1. Event Creation Modal

- Event details form (title, description, start/end times, location)
- Attendee selection (workspace members)
- Privacy settings (public/private)
- Recurrence options
- Send invitations toggle

### 2. Event Details View

- Event information display
- Attendee list with status indicators
- Action buttons (edit, cancel, reschedule)
- Add/remove attendees

### 3. Event Invitation Component

- Invitation display with event details
- Accept/Decline/Tentative buttons
- Optional notes field
- Calendar integration preview

### 4. Calendar View Updates

- Show pending events differently (e.g., dashed borders)
- Filter options (all events, accepted only, pending)
- Event status indicators
- Quick response actions

### 5. Attendee Management Panel

- List of all invited attendees
- Status tracking
- Bulk actions (resend invitations, remove attendees)
- Response analytics

## Business Logic

### 1. Event Creation Flow

1. User creates event with basic details
2. Selects attendees from workspace members
3. System creates event record
4. System creates attendee records with 'pending' status
5. System sends invitations (email/notification)
6. Event appears in creator's calendar immediately

### 2. Attendee Response Flow

1. Attendee receives invitation/ sees in calendar
2. Attendee responds (accept/decline/tentative)
3. System updates attendee status
4. If accepted: Event appears in attendee's calendar
5. If declined: Event stays in calendar up until the time of event, after the time of event, it gets deleted from calendar
6. If tentative: Event shown with tentative indicator

### 3. Calendar Display Logic

- **Creator**: Sees all events they created
- **Attendees**: Only see events they've accepted
- **Pending**: Events with 'pending' status shown separately
- **Declined**: Events not shown in calendar

### 4. Notification System

- In-app notifications & email for workspace members
- Reminder notifications before event
- Update notifications for event changes

## Integration Points

### 1. Existing Calendar System

- Extend `SmartCalendar` component to handle scheduled events
- Integrate with existing `workspace_calendar_events` for backward compatibility
- Update calendar sync logic to include attendee status

### 2. Task System

- Link events to tasks when appropriate
- Show related events in task views
- Allow task assignment from event attendees

### 3. Time Tracking

- Integrate with existing time tracking system
- Allow logging time against scheduled events
- Show event duration in time tracking analytics

### 4. Workspace Management

- Leverage existing workspace member system
- Integrate with workspace permissions
- Use existing role-based access control

## Data Migration Strategy

### 1. Phase 1: Schema Creation

- Create new tables and enums
- Add indexes and constraints
- Implement RLS policies
- Update type definitions

### 2. Phase 2: API Development

- Implement backend API endpoints
- Add validation and error handling
- Implement business logic
- Add authentication and authorization

### 3. Phase 3: Frontend Integration

- Create new React components
- Integrate with existing calendar
- Add invitation system
- Implement attendee management

### 4. Phase 4: Testing and Deployment

- Comprehensive testing
- User acceptance testing
- Gradual rollout
- Monitor performance and usage

## Security Considerations

### 1. Access Control

- Users can only see events in workspaces they're members of
- Event creators have full control over their events
- Attendees can only modify their own attendance status
- Invitation tokens are secure and time-limited

### 2. Data Privacy

- Event details are only visible to invited attendees
- Declined events are not stored in attendee calendars
- Invitation history is maintained for audit purposes
- Personal notes are only visible to the note author

### 3. Rate Limiting

- Limit invitation sending frequency
- Prevent spam invitations
- Implement cooldown periods for repeated actions

## Performance Considerations

### 1. Database Optimization

- Efficient indexing for common queries
- Pagination for large attendee lists
- Caching for frequently accessed data
- Optimized joins for calendar views

### 2. Frontend Performance

- Lazy loading of attendee lists
- Debounced search for member selection
- Optimistic updates for better UX
- Efficient re-rendering strategies
