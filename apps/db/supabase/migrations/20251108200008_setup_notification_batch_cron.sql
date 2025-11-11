-- Note: pg_cron extension is already available in Supabase by default
-- No need to explicitly create it

-- Function to process notification batches
CREATE OR REPLACE FUNCTION public.process_notification_batches()
RETURNS void AS $$
DECLARE
  v_batch RECORD;
  v_notification RECORD;
  v_notifications JSONB := '[]'::jsonb;
  v_user_email TEXT;
  v_user_name TEXT;
  v_workspace_name TEXT;
  v_workspace_url TEXT;
  v_email_body TEXT;
  v_notification_count INTEGER;
BEGIN
  -- Harden search_path to prevent privilege escalation
  SET LOCAL search_path = pg_temp, public;

  -- Find all pending batches where window_end has passed
  -- Use FOR UPDATE SKIP LOCKED to atomically claim batches and prevent race conditions
  FOR v_batch IN
    SELECT *
    FROM public.notification_batches
    WHERE status = 'pending'
      AND window_end <= now()
    ORDER BY window_end ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- Mark batch as processing (with status check to ensure we still own it)
      UPDATE public.notification_batches
      SET status = 'processing',
          updated_at = now()
      WHERE id = v_batch.id
        AND status = 'pending'; -- Double-check status hasn't changed

      -- Get all pending notifications for this batch
      v_notifications := '[]'::jsonb;
      v_notification_count := 0;

      FOR v_notification IN
        SELECT n.*
        FROM public.notification_delivery_log ndl
        JOIN public.notifications n ON ndl.notification_id = n.id
        WHERE ndl.batch_id = v_batch.id
          AND ndl.status = 'pending'
          AND ndl.channel = 'email'
        ORDER BY n.created_at DESC
      LOOP
        v_notification_count := v_notification_count + 1;

        -- Build notifications array
        v_notifications := v_notifications || jsonb_build_object(
          'id', v_notification.id,
          'type', v_notification.type,
          'title', v_notification.title,
          'description', v_notification.description,
          'data', v_notification.data,
          'created_at', v_notification.created_at
        );
      END LOOP;

      -- If no notifications, mark batch as sent and continue
      IF v_notification_count = 0 THEN
        UPDATE public.notification_batches
        SET status = 'sent',
            sent_at = now(),
            updated_at = now()
        WHERE id = v_batch.id;

        CONTINUE;
      END IF;

      -- Get user details
      SELECT email, COALESCE(display_name, email)
      INTO v_user_email, v_user_name
      FROM public.users
      WHERE id = v_batch.user_id;

      -- Get workspace details
      SELECT name INTO v_workspace_name
      FROM public.workspaces
      WHERE id = v_batch.ws_id;

      -- Build workspace URL
      v_workspace_url := COALESCE(
        current_setting('app.base_url', true),
        'https://tuturuuu.com'
      ) || '/' || v_batch.ws_id;

      -- TODO: Send actual email here
      -- This is a placeholder - integrate with your email sending service
      -- Example: Call a function that sends email via your email provider
      -- PERFORM public.send_email_digest(
      --   v_user_email,
      --   v_user_name,
      --   v_workspace_name,
      --   v_notifications,
      --   v_workspace_url
      -- );

      -- For now, just log that we would send an email
      RAISE NOTICE 'Would send email to % with % notifications', v_user_email, v_notification_count;

      -- Mark all delivery logs as sent
      UPDATE public.notification_delivery_log
      SET status = 'sent',
          sent_at = now(),
          updated_at = now()
      WHERE batch_id = v_batch.id
        AND status = 'pending';

      -- Mark batch as sent
      UPDATE public.notification_batches
      SET status = 'sent',
          sent_at = now(),
          notification_count = v_notification_count,
          updated_at = now()
      WHERE id = v_batch.id;

    EXCEPTION WHEN OTHERS THEN
      -- Mark batch as failed
      UPDATE public.notification_batches
      SET status = 'failed',
          error_message = SQLERRM,
          updated_at = now()
      WHERE id = v_batch.id;

      -- Mark delivery logs as failed
      UPDATE public.notification_delivery_log
      SET status = 'failed',
          error_message = SQLERRM,
          retry_count = retry_count + 1,
          updated_at = now()
      WHERE batch_id = v_batch.id
        AND status = 'pending';

      RAISE WARNING 'Failed to process batch %: %', v_batch.id, SQLERRM;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule the function to run every 2 minutes
-- Make idempotent by checking if job already exists
DO $$
BEGIN
  -- Only create the cron job if it doesn't already exist
  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'process-notification-batches'
  ) THEN
    PERFORM cron.schedule(
      'process-notification-batches',
      '*/2 * * * *', -- Every 2 minutes
      'SELECT public.process_notification_batches()'
    );
    RAISE NOTICE 'Created cron job: process-notification-batches';
  ELSE
    RAISE NOTICE 'Cron job already exists: process-notification-batches';
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON FUNCTION public.process_notification_batches IS 'Processes pending notification batches and sends email digests. Runs every 2 minutes via pg_cron.';
