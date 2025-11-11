-- Update notification batch processor to use the new API route
--
-- The previous implementation had a placeholder that only logged emails.
-- The new implementation uses an API route at /api/cron/process-notification-batches
-- which actually sends emails via AWS SES.
--
-- This migration removes the old pg_cron job and provides instructions for
-- setting up the new API-based approach.

-- Step 1: Remove the old cron job that only logged emails
DO $$
BEGIN
  PERFORM cron.unschedule('process-notification-batches');
  RAISE NOTICE 'Removed old cron job: process-notification-batches';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'Cron job does not exist, skipping';
END $$;

-- Step 2: Keep the process_notification_batches function for reference but mark it as deprecated
COMMENT ON FUNCTION public.process_notification_batches IS
'[DEPRECATED] This function is no longer used. Email sending now happens via the API route /api/cron/process-notification-batches which should be called by an external cron service or Trigger.dev.

To set up email notifications:

1. Add CRON_SECRET to your .env.local file
2. Configure AWS SES credentials in workspace_email_credentials table (root workspace)
3. Set up one of the following:

   Option A - External Cron (Recommended for production):
   - Use a service like cron-job.org, EasyCron, or your hosting provider
   - Schedule POST requests to: https://your-domain.com/api/cron/process-notification-batches
   - Include header: Authorization: Bearer YOUR_CRON_SECRET
   - Run every 2-5 minutes

   Option B - Trigger.dev (Recommended for development):
   - Create a scheduled task in packages/trigger/src/send-notification-emails.ts
   - Configure it to call the API route every 2-5 minutes

   Option C - Vercel Cron (If deployed on Vercel):
   - Add to vercel.json:
     {
       "crons": [{
         "path": "/api/cron/process-notification-batches",
         "schedule": "*/2 * * * *"
       }]
     }

The API route will:
- Fetch pending notification batches from the database
- Render email templates using React Email
- Send emails via AWS SES
- Update batch status in the database
';

-- Step 3: Add helpful comments to related tables
COMMENT ON TABLE public.notification_batches IS 'Stores batches of notifications for digest email delivery. Batches are processed by the /api/cron/process-notification-batches endpoint.';
COMMENT ON TABLE public.notification_delivery_log IS 'Tracks delivery status of notifications across different channels (web, email, etc.). Email deliveries are processed in batches.';
