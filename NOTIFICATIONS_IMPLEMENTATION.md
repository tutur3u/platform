# Notification System Implementation Guide

## Overview

This guide provides step-by-step instructions for implementing the comprehensive notification system in the Tuturuuu platform.

## ✅ Completed Components

### Database Layer
- ✅ `notifications` table with RLS policies
- ✅ `notification_preferences` table for user control
- ✅ `notification_delivery_log` for email/SMS tracking
- ✅ `notification_batches` for smart batching (5-15 min)
- ✅ Database functions for auto-notification creation
- ✅ Triggers for task assignment and updates
- ✅ Realtime enabled for all notification tables
- ✅ Supabase cron job for batch processing (every 2 minutes)

### Backend Services
- ✅ Notification service utilities (`packages/utils/src/notification-service.ts`)
- ✅ API routes:
  - `GET /api/v1/notifications` - Fetch notifications
  - `PATCH /api/v1/notifications` - Bulk mark as read
  - `PATCH /api/v1/notifications/[id]` - Mark single notification
  - `DELETE /api/v1/notifications/[id]` - Delete notification
  - `GET /api/v1/notifications/unread-count` - Get unread count
  - `GET /api/v1/notifications/preferences` - Get preferences
  - `PUT /api/v1/notifications/preferences` - Update preferences

### Frontend Components
- ✅ React Query hooks (`useNotifications`, `useNotificationPreferences`)
- ✅ Browser notification hook (`useBrowserNotifications`)
- ✅ Enhanced notification popover component
- ✅ Notification preferences card component
- ✅ Notification settings page

### Email Templates
- ✅ Notification digest email template

### Internationalization
- ✅ English translations
- ✅ Vietnamese translations

## 🔨 Implementation Steps

### Step 1: Apply Database Migrations

```bash
# Start Supabase (if not already running)
bun sb:start

# Apply all migrations
bun sb:up

# Generate TypeScript types
bun sb:typegen
```

This will create all the necessary tables, functions, triggers, and cron jobs.

### Step 2: Verify Cron Job

Check that the cron job is scheduled:

```sql
-- In Supabase SQL Editor
SELECT * FROM cron.job;
```

You should see a job named `process-notification-batches` running every 2 minutes.

### Step 3: Replace Notification Popover

Update `/apps/web/src/app/[locale]/layout.tsx` (or wherever the notification popover is used):

```tsx
// Old import
import NotificationPopover from './notification-popover';

// New import
import EnhancedNotificationPopover from '@/components/notifications/enhanced-notification-popover';

// In your component, replace:
<NotificationPopover />

// With (you'll need to pass wsId and userId):
<EnhancedNotificationPopover wsId={wsId} userId={userId} />
```

### Step 4: Add Notification Settings to Navigation

Add the notification settings link to your workspace settings navigation. Update the relevant navigation file (e.g., settings navigation):

```tsx
{
  title: 'Notifications',
  href: `/[wsId]/settings/notifications`,
  icon: Bell,
  description: 'Configure notification preferences',
}
```

### Step 5: Test the System

#### Test 1: Task Assignment Notifications

1. Log in as User A
2. Assign a task to User B
3. Verify:
   - User B sees notification in the popover
   - Notification appears in real-time
   - Browser notification shows (if permission granted)
   - Email batch is created in `notification_batches` table

#### Test 2: Task Update Notifications

1. Update a task (change status, priority, or due date)
2. Verify assignees receive notifications
3. Verify the user who made the change does NOT receive a notification

#### Test 3: Batch Email Processing

1. Create multiple notifications for a user
2. Wait 5-15 minutes
3. Check `notification_batches` table - status should change from 'pending' to 'sent'
4. Check `notification_delivery_log` table - delivery logs should be marked as 'sent'

#### Test 4: Notification Preferences

1. Navigate to workspace settings → Notifications
2. Toggle preferences for different channels and event types
3. Save preferences
4. Verify preferences are respected when creating new notifications

### Step 6: Email Integration (Optional)

The system currently logs email sends but doesn't actually send emails. To integrate with your email provider:

1. Update the `process_notification_batches()` function in migration `20251024000008_setup_notification_batch_cron.sql`
2. Replace the TODO comment with actual email sending logic:

```sql
-- Example integration with your email service
PERFORM public.send_email_via_provider(
  v_user_email,
  'Notification Digest',
  v_email_body, -- Render the notification-digest.tsx template
  v_workspace_name
);
```

3. You can use the React Email template at `packages/transactional/emails/notification-digest.tsx`

## 📊 Database Schema Overview

### Notifications Table
```sql
- id: UUID (primary key)
- ws_id: UUID (workspace)
- user_id: UUID (recipient)
- type: TEXT (task_assigned, task_updated, task_mention, workspace_invite)
- title: TEXT
- description: TEXT
- data: JSONB (event-specific data)
- entity_type: TEXT (task, workspace, etc.)
- entity_id: UUID
- read_at: TIMESTAMPTZ (null = unread)
- created_at: TIMESTAMPTZ
- created_by: UUID
```

### Notification Preferences Table
```sql
- id: UUID (primary key)
- ws_id: UUID (workspace)
- user_id: UUID
- event_type: TEXT
- channel: TEXT (web, email, sms, push)
- enabled: BOOLEAN
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ
UNIQUE(ws_id, user_id, event_type, channel)
```

### Notification Batches Table
```sql
- id: UUID (primary key)
- ws_id: UUID (workspace)
- user_id: UUID
- channel: TEXT (email, sms)
- status: TEXT (pending, processing, sent, failed)
- window_start: TIMESTAMPTZ
- window_end: TIMESTAMPTZ (when to send)
- sent_at: TIMESTAMPTZ
- notification_count: INTEGER
- error_message: TEXT
```

## 🎯 How It Works

### Notification Flow

1. **Event Occurs** (e.g., task assignment)
   ```
   User assigns task to another user
   ↓
   INSERT into task_assignees
   ↓
   Trigger: notify_on_task_assigned
   ↓
   Function: notify_task_assigned()
   ↓
   Function: create_notification()
   ```

2. **Notification Creation**
   ```
   create_notification()
   ↓
   Check user preferences (web/email)
   ↓
   Create notification in 'notifications' table (if web enabled)
   ↓
   Create delivery log entry (if email enabled)
   ↓
   Get or create batch (5-15 min window)
   ↓
   Add to batch
   ```

3. **Realtime Update**
   ```
   Notification inserted
   ↓
   Supabase Realtime broadcasts change
   ↓
   Frontend subscription receives update
   ↓
   React Query invalidates cache
   ↓
   UI updates with new notification
   ↓
   Browser notification shown (if permission granted)
   ```

4. **Email Batch Processing**
   ```
   Cron job runs every 2 minutes
   ↓
   process_notification_batches()
   ↓
   Find batches where window_end has passed
   ↓
   Collect notifications for each batch
   ↓
   Send email digest (TODO: integrate with email provider)
   ↓
   Mark batch and delivery logs as 'sent'
   ```

## 🔧 Customization

### Adding New Notification Types

1. Add the type to the TypeScript enum:
   ```typescript
   // In useNotifications.ts
   export type NotificationType =
     | 'task_assigned'
     | 'task_updated'
     | 'task_mention'
     | 'workspace_invite'
     | 'your_new_type';
   ```

2. Add translations:
   ```json
   // en.json and vi.json
   "notifications": {
     "types": {
       "your_new_type": "Your New Type"
     },
     "settings": {
       "events": {
         "your_new_type": "Description of your new type"
       }
     }
   }
   ```

3. Create a database trigger or call `create_notification()` programmatically:
   ```sql
   SELECT public.create_notification(
     p_ws_id := 'workspace-id',
     p_user_id := 'user-id',
     p_type := 'your_new_type',
     p_title := 'Your notification title',
     p_description := 'Description',
     p_data := '{"custom": "data"}'::jsonb
   );
   ```

### Customizing Batch Windows

To change the batching window from 10 minutes to something else:

1. Update the migration:
   ```sql
   -- In 20251024000004_create_notification_batches_table.sql
   -- Change the default in get_or_create_notification_batch()
   p_window_minutes INTEGER DEFAULT 15  -- Changed from 10 to 15
   ```

2. Or specify when creating notifications programmatically

### Adding Mention Support

To enable @mentions in tasks:

1. When saving task description/comments, scan for mentions:
   ```typescript
   import { createMentionNotifications } from '@tuturuuu/utils/notification-service';

   // After saving task
   await createMentionNotifications(
     wsId,
     taskDescription,
     'task',
     taskId,
     taskName,
     currentUserId
   );
   ```

## 📈 Monitoring

### Check Notification System Health

```sql
-- Total notifications
SELECT COUNT(*) FROM notifications;

-- Unread notifications per workspace
SELECT ws_id, COUNT(*)
FROM notifications
WHERE read_at IS NULL
GROUP BY ws_id;

-- Pending batches
SELECT * FROM notification_batches WHERE status = 'pending';

-- Failed batches (needs attention)
SELECT * FROM notification_batches WHERE status = 'failed';

-- Delivery success rate
SELECT
  channel,
  COUNT(*) FILTER (WHERE status = 'sent') as sent,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) as total
FROM notification_delivery_log
GROUP BY channel;
```

## 🐛 Troubleshooting

### Notifications Not Appearing

1. Check if triggers are enabled:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname LIKE 'notify%';
   ```

2. Check if notifications are being created:
   ```sql
   SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10;
   ```

3. Verify RLS policies:
   ```sql
   SELECT * FROM notifications WHERE user_id = 'your-user-id';
   ```

### Emails Not Sending

1. Check batch status:
   ```sql
   SELECT * FROM notification_batches WHERE status = 'failed';
   ```

2. Check error messages:
   ```sql
   SELECT error_message FROM notification_batches WHERE error_message IS NOT NULL;
   ```

3. Verify cron job is running:
   ```sql
   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
   ```

### Realtime Not Working

1. Verify realtime is enabled:
   ```sql
   SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
   ```

2. Check subscription in browser console for errors

3. Verify RLS policies allow the user to see their notifications

## 🚀 Next Steps

1. **Email Provider Integration**: Implement actual email sending in the `process_notification_batches()` function
2. **SMS Integration**: Add SMS provider integration for SMS channel
3. **Push Notifications**: Implement web push notifications using service workers
4. **Notification Sounds**: Add sound effects for new notifications
5. **Quiet Hours**: Allow users to set quiet hours when they don't want to be notified
6. **Notification Grouping**: Group similar notifications (e.g., "John and 3 others assigned you to tasks")
7. **Slack Integration**: Send notifications to Slack channels
8. **Mobile App**: Extend to mobile push notifications

## 📚 Related Files

### Database Migrations
- `apps/db/supabase/migrations/20251024000001_create_notifications_table.sql`
- `apps/db/supabase/migrations/20251024000002_create_notification_preferences_table.sql`
- `apps/db/supabase/migrations/20251024000003_create_notification_delivery_log_table.sql`
- `apps/db/supabase/migrations/20251024000004_create_notification_batches_table.sql`
- `apps/db/supabase/migrations/20251024000005_create_notification_functions.sql`
- `apps/db/supabase/migrations/20251024000006_create_notification_triggers.sql`
- `apps/db/supabase/migrations/20251024000007_enable_realtime_for_notifications.sql`
- `apps/db/supabase/migrations/20251024000008_setup_notification_batch_cron.sql`

### Backend
- `packages/utils/src/notification-service.ts` - Service utilities
- `apps/web/src/app/api/v1/notifications/route.ts` - List/bulk operations API
- `apps/web/src/app/api/v1/notifications/[id]/route.ts` - Single notification API
- `apps/web/src/app/api/v1/notifications/unread-count/route.ts` - Unread count API
- `apps/web/src/app/api/v1/notifications/preferences/route.ts` - Preferences API

### Frontend Hooks
- `apps/web/src/hooks/useNotifications.ts` - Notifications React Query hooks
- `apps/web/src/hooks/useNotificationPreferences.ts` - Preferences hooks
- `apps/web/src/hooks/useBrowserNotifications.ts` - Browser notification hook

### Frontend Components
- `apps/web/src/components/notifications/enhanced-notification-popover.tsx` - Main popover
- `apps/web/src/components/notifications/notification-preferences-card.tsx` - Settings UI
- `apps/web/src/app/[locale]/(dashboard)/[wsId]/(workspace-settings)/settings/notifications/page.tsx` - Settings page

### Email Templates
- `packages/transactional/emails/notification-digest.tsx`

### Translations
- `apps/web/messages/en.json` - English
- `apps/web/messages/vi.json` - Vietnamese
