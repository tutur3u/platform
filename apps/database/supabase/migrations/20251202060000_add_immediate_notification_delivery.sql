-- ============================================================================
-- ADD IMMEDIATE NOTIFICATION DELIVERY SUPPORT
-- ============================================================================
-- This migration adds support for sending certain notification types immediately
-- instead of batching them. The system is designed to be extendable for future
-- notification types that need individual emails.

-- Step 1: Create enum for delivery mode
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_delivery_mode') THEN
        CREATE TYPE public.notification_delivery_mode AS ENUM ('immediate', 'batched');
    END IF;
END$$;

-- Step 2: Add delivery_mode column to notification_batches
ALTER TABLE public.notification_batches
    ADD COLUMN IF NOT EXISTS delivery_mode public.notification_delivery_mode NOT NULL DEFAULT 'batched';

-- Step 3: Create notification email configuration table
-- This table defines which notification types should be sent immediately and with which email template
CREATE TABLE IF NOT EXISTS public.notification_email_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_type TEXT NOT NULL UNIQUE,
    delivery_mode public.notification_delivery_mode NOT NULL DEFAULT 'batched',
    email_template TEXT, -- Template identifier for immediate emails (e.g., 'workspace-invite', 'task-critical')
    email_subject_template TEXT, -- Subject line template with placeholders
    priority_override public.notification_priority, -- Optional: override notification priority
    batch_window_minutes INTEGER DEFAULT 10, -- Custom batch window for batched notifications
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Step 4: Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_notification_email_config_type ON public.notification_email_config(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_email_config_mode ON public.notification_email_config(delivery_mode) WHERE delivery_mode = 'immediate';
CREATE INDEX IF NOT EXISTS idx_notification_batches_delivery_mode ON public.notification_batches(delivery_mode, status);

-- Step 5: Insert default configuration for workspace invites (immediate delivery)
INSERT INTO public.notification_email_config (notification_type, delivery_mode, email_template, email_subject_template, priority_override)
VALUES
    ('workspace_invite', 'immediate', 'workspace-invite', 'You''ve been invited to join {workspace_name}', 'high')
ON CONFLICT (notification_type) DO UPDATE
SET delivery_mode = 'immediate',
    email_template = 'workspace-invite',
    email_subject_template = 'You''ve been invited to join {workspace_name}',
    priority_override = 'high',
    updated_at = now();

-- Step 6: Add other notification types with batched delivery (default)
-- This sets up the configuration for common notification types
INSERT INTO public.notification_email_config (notification_type, delivery_mode, email_template, batch_window_minutes)
VALUES
    ('task_assigned', 'batched', NULL, 10),
    ('task_updated', 'batched', NULL, 10),
    ('task_completed', 'batched', NULL, 10),
    ('task_reopened', 'batched', NULL, 10),
    ('task_priority_changed', 'batched', NULL, 10),
    ('task_due_date_changed', 'batched', NULL, 10),
    ('task_moved', 'batched', NULL, 10),
    ('task_mention', 'batched', NULL, 5), -- Shorter window for mentions
    ('task_comment', 'batched', NULL, 5)
ON CONFLICT (notification_type) DO NOTHING;

-- Step 7: Create helper function to get notification email config
CREATE OR REPLACE FUNCTION public.get_notification_email_config(p_notification_type TEXT)
RETURNS TABLE (
    delivery_mode public.notification_delivery_mode,
    email_template TEXT,
    email_subject_template TEXT,
    priority_override public.notification_priority,
    batch_window_minutes INTEGER,
    enabled BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        nec.delivery_mode,
        nec.email_template,
        nec.email_subject_template,
        nec.priority_override,
        nec.batch_window_minutes,
        nec.enabled
    FROM public.notification_email_config nec
    WHERE nec.notification_type = p_notification_type
      AND nec.enabled = true;

    -- Return default config if no specific config found
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT
            'batched'::public.notification_delivery_mode,
            NULL::TEXT,
            NULL::TEXT,
            NULL::public.notification_priority,
            10::INTEGER,
            true::BOOLEAN;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Step 8: Create function to get or create batch with delivery mode support
CREATE OR REPLACE FUNCTION public.get_or_create_notification_batch(
    p_ws_id UUID,
    p_user_id UUID,
    p_channel TEXT,
    p_window_minutes INTEGER DEFAULT 10,
    p_email TEXT DEFAULT NULL,
    p_delivery_mode public.notification_delivery_mode DEFAULT 'batched'
)
RETURNS UUID AS $$
DECLARE
    v_batch_id UUID;
    v_window_start TIMESTAMPTZ;
    v_window_end TIMESTAMPTZ;
BEGIN
    -- For immediate delivery, always create a new batch (no reuse)
    IF p_delivery_mode = 'immediate' THEN
        v_window_start := now();
        v_window_end := now(); -- Immediate batches have zero window

        INSERT INTO public.notification_batches (
            ws_id,
            user_id,
            email,
            channel,
            window_start,
            window_end,
            delivery_mode
        ) VALUES (
            p_ws_id,
            p_user_id,
            p_email,
            p_channel,
            v_window_start,
            v_window_end,
            'immediate'
        )
        RETURNING id INTO v_batch_id;

        RETURN v_batch_id;
    END IF;

    -- For batched delivery, try to find existing pending batch within window
    IF p_user_id IS NOT NULL THEN
        SELECT id INTO v_batch_id
        FROM public.notification_batches
        WHERE (ws_id = p_ws_id OR (ws_id IS NULL AND p_ws_id IS NULL))
          AND user_id = p_user_id
          AND channel = p_channel
          AND status = 'pending'
          AND delivery_mode = 'batched'
          AND window_end > now()
        ORDER BY window_start DESC
        LIMIT 1;
    ELSIF p_email IS NOT NULL THEN
        SELECT id INTO v_batch_id
        FROM public.notification_batches
        WHERE (ws_id = p_ws_id OR (ws_id IS NULL AND p_ws_id IS NULL))
          AND email = p_email
          AND channel = p_channel
          AND status = 'pending'
          AND delivery_mode = 'batched'
          AND window_end > now()
        ORDER BY window_start DESC
        LIMIT 1;
    END IF;

    -- If no batch found, create a new one
    IF v_batch_id IS NULL THEN
        v_window_start := now();
        v_window_end := now() + (p_window_minutes || ' minutes')::interval;

        INSERT INTO public.notification_batches (
            ws_id,
            user_id,
            email,
            channel,
            window_start,
            window_end,
            delivery_mode
        ) VALUES (
            p_ws_id,
            p_user_id,
            p_email,
            p_channel,
            v_window_start,
            v_window_end,
            'batched'
        )
        RETURNING id INTO v_batch_id;
    END IF;

    RETURN v_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 9: Update create_notification to use notification email config
CREATE OR REPLACE FUNCTION public.create_notification(
    p_ws_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_type TEXT DEFAULT NULL,
    p_code TEXT DEFAULT NULL,
    p_title TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_data JSONB DEFAULT '{}'::jsonb,
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id UUID DEFAULT NULL,
    p_created_by UUID DEFAULT NULL,
    p_scope public.notification_scope DEFAULT 'workspace',
    p_priority public.notification_priority DEFAULT 'medium'
)
RETURNS UUID AS $$
DECLARE
    v_notification_id UUID;
    v_should_send_web BOOLEAN;
    v_should_send_email BOOLEAN;
    v_batch_id UUID;
    v_target_user_id UUID;
    v_target_email TEXT;
    v_email_config RECORD;
    v_delivery_mode public.notification_delivery_mode;
    v_batch_window INTEGER;
    v_final_priority public.notification_priority;
BEGIN
    -- Validate that at least user_id or email is provided
    IF p_user_id IS NULL AND p_email IS NULL THEN
        RAISE EXCEPTION 'Either p_user_id or p_email must be provided';
    END IF;

    -- Get email configuration for this notification type
    SELECT * INTO v_email_config
    FROM public.get_notification_email_config(COALESCE(p_type, p_code));

    v_delivery_mode := COALESCE(v_email_config.delivery_mode, 'batched');
    v_batch_window := COALESCE(v_email_config.batch_window_minutes, 10);
    v_final_priority := COALESCE(v_email_config.priority_override, p_priority);

    -- Determine target user_id and email
    IF p_user_id IS NOT NULL THEN
        v_target_user_id := p_user_id;
        -- Get email from user_id if not provided
        IF p_email IS NULL THEN
            SELECT email INTO v_target_email
            FROM public.user_private_details
            WHERE user_id = p_user_id;
        ELSE
            v_target_email := p_email;
        END IF;
    ELSE
        -- Only email provided (pending user)
        v_target_user_id := NULL;
        v_target_email := p_email;
    END IF;

    -- Check if notifications are enabled (skip if no user_id for preferences)
    IF v_target_user_id IS NOT NULL THEN
        v_should_send_web := public.should_send_notification(
            v_target_user_id,
            COALESCE(p_type, p_code),
            'web',
            p_scope,
            p_ws_id
        );
    ELSE
        -- For pending users, always create notification (they'll see it when they sign up)
        v_should_send_web := TRUE;
    END IF;

    -- Only create notification if enabled
    IF v_should_send_web THEN
        -- Create the notification
        INSERT INTO public.notifications (
            ws_id,
            user_id,
            email,
            type,
            code,
            title,
            description,
            data,
            entity_type,
            entity_id,
            created_by,
            scope,
            priority
        ) VALUES (
            p_ws_id,
            v_target_user_id,
            v_target_email,
            p_type,
            p_code,
            p_title,
            p_description,
            p_data,
            p_entity_type,
            p_entity_id,
            p_created_by,
            p_scope,
            v_final_priority
        )
        RETURNING id INTO v_notification_id;

        -- Check if email notifications are enabled
        IF v_target_user_id IS NOT NULL THEN
            v_should_send_email := public.should_send_notification(
                v_target_user_id,
                COALESCE(p_type, p_code),
                'email',
                p_scope,
                p_ws_id
            );
        ELSE
            -- For pending users, always send email
            v_should_send_email := TRUE;
        END IF;

        -- If email is enabled, add to delivery queue
        IF v_should_send_email AND v_target_email IS NOT NULL THEN
            -- Get or create a batch with appropriate delivery mode
            v_batch_id := public.get_or_create_notification_batch(
                p_ws_id,
                v_target_user_id,
                'email',
                v_batch_window,
                v_target_email,
                v_delivery_mode
            );

            -- Create delivery log entry
            INSERT INTO public.notification_delivery_log (
                notification_id,
                channel,
                status,
                batch_id
            ) VALUES (
                v_notification_id,
                'email',
                'pending',
                v_batch_id
            );

            -- Update batch notification count
            UPDATE public.notification_batches
            SET notification_count = notification_count + 1
            WHERE id = v_batch_id;
        END IF;

        RETURN v_notification_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 10: Enable RLS on notification_email_config
ALTER TABLE public.notification_email_config ENABLE ROW LEVEL SECURITY;

-- Only service role can manage email config (no access for authenticated users)
CREATE POLICY "Service role can manage email config"
    ON public.notification_email_config
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Step 11: Grant permissions (service_role only - email config is sensitive)
GRANT ALL ON public.notification_email_config TO service_role;

-- Step 12: Add trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_notification_email_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_notification_email_config_updated_at ON public.notification_email_config;
CREATE TRIGGER update_notification_email_config_updated_at
    BEFORE UPDATE ON public.notification_email_config
    FOR EACH ROW
    EXECUTE FUNCTION public.update_notification_email_config_updated_at();

-- Step 13: Create trigger to call immediate notification endpoint when an immediate batch is created
-- This uses pg_net extension to make HTTP requests from the database
-- Note: pg_net must be enabled in your Supabase project

-- Create function to trigger immediate notification processing
CREATE OR REPLACE FUNCTION public.trigger_immediate_notification_send()
RETURNS TRIGGER AS $$
DECLARE
    v_app_url TEXT;
    v_service_key TEXT;
BEGIN
    -- Only trigger for immediate delivery mode batches
    IF NEW.delivery_mode != 'immediate' THEN
        RETURN NEW;
    END IF;

    -- Get app URL from settings or use default
    v_app_url := COALESCE(
        current_setting('app.base_url', true),
        'https://tuturuuu.com'
    );

    -- Get service role key for authorization
    -- Note: This should be set via Supabase Vault or environment variable
    v_service_key := COALESCE(
        current_setting('app.service_role_key', true),
        ''
    );

    -- Only make the HTTP call if we have pg_net extension and service key
    IF v_service_key != '' THEN
        -- Queue the HTTP request to send the immediate notification
        -- pg_net.http_post is non-blocking and won't slow down the insert
        PERFORM net.http_post(
            url := v_app_url || '/api/notifications/send-immediate',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_service_key
            ),
            body := jsonb_build_object('batch_id', NEW.id)
        );
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the insert
        -- The cron job will pick up any missed immediate notifications
        RAISE WARNING 'Failed to trigger immediate notification send: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on notification_batches for immediate delivery
-- Only fires for INSERT operations with delivery_mode = 'immediate'
DROP TRIGGER IF EXISTS trigger_send_immediate_notification ON public.notification_batches;
CREATE TRIGGER trigger_send_immediate_notification
    AFTER INSERT ON public.notification_batches
    FOR EACH ROW
    WHEN (NEW.delivery_mode = 'immediate')
    EXECUTE FUNCTION public.trigger_immediate_notification_send();

-- Step 14: Add comments for documentation
COMMENT ON TYPE public.notification_delivery_mode IS 'Delivery mode for notification emails: immediate (sent right away) or batched (grouped in digest)';
COMMENT ON TABLE public.notification_email_config IS 'Configuration for notification email delivery - defines which types are sent immediately vs batched';
COMMENT ON COLUMN public.notification_email_config.notification_type IS 'The notification type this config applies to (e.g., workspace_invite, task_assigned)';
COMMENT ON COLUMN public.notification_email_config.delivery_mode IS 'immediate: send individual email right away, batched: group in digest email';
COMMENT ON COLUMN public.notification_email_config.email_template IS 'Template identifier for immediate emails (used to select React Email template)';
COMMENT ON COLUMN public.notification_email_config.email_subject_template IS 'Subject line template with {placeholder} variables';
COMMENT ON COLUMN public.notification_email_config.priority_override IS 'Optional priority override for this notification type';
COMMENT ON COLUMN public.notification_email_config.batch_window_minutes IS 'Batch window duration in minutes (only used for batched mode)';
COMMENT ON COLUMN public.notification_batches.delivery_mode IS 'Whether this batch should be sent immediately or after the batch window';
COMMENT ON FUNCTION public.get_notification_email_config IS 'Returns email configuration for a notification type, with defaults if not configured';
COMMENT ON FUNCTION public.trigger_immediate_notification_send IS 'Trigger function that calls the immediate notification API endpoint via pg_net when an immediate batch is created';
