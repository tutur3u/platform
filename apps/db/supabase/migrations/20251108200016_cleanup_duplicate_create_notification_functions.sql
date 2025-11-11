-- Cleanup duplicate create_notification function definitions
-- Multiple migrations created conflicting versions, causing "function is not unique" errors
-- This migration drops all old overloaded versions, keeping only the latest from 20251028071341

-- Drop each version of create_notification explicitly by signature
-- We need to drop them one by one since they're overloaded

-- Version 1: From 20251024000005_create_notification_functions.sql (9 params, most specific)
DROP FUNCTION IF EXISTS public.create_notification(
    UUID,  -- p_ws_id
    UUID,  -- p_user_id
    TEXT,  -- p_type
    TEXT,  -- p_title
    TEXT,  -- p_description
    JSONB, -- p_data
    TEXT,  -- p_entity_type
    UUID,  -- p_entity_id
    UUID   -- p_created_by
);

-- Version 2: From 20251028065506_upgrade_notifications_system.sql (14 params)
DROP FUNCTION IF EXISTS public.create_notification(
    UUID,  -- p_user_id
    TEXT,  -- p_type
    TEXT,  -- p_title
    TEXT,  -- p_description
    public.notification_scope,  -- p_scope
    UUID,  -- p_ws_id
    JSONB, -- p_data
    TEXT,  -- p_entity_type
    UUID,  -- p_entity_id
    UUID,  -- p_created_by
    public.notification_priority,  -- p_priority
    TEXT,  -- p_action_url
    TIMESTAMPTZ,  -- p_expires_at
    UUID   -- p_parent_id
);

-- Version 3: From 20251028071341_add_notification_codes_and_email_support.sql (13 params, all defaults)
DROP FUNCTION IF EXISTS public.create_notification(
    UUID,  -- p_ws_id
    UUID,  -- p_user_id
    TEXT,  -- p_email
    TEXT,  -- p_type
    TEXT,  -- p_code
    TEXT,  -- p_title
    TEXT,  -- p_description
    JSONB, -- p_data
    TEXT,  -- p_entity_type
    UUID,  -- p_entity_id
    UUID,  -- p_created_by
    public.notification_scope,  -- p_scope
    public.notification_priority  -- p_priority
);

-- Recreate the latest version (from 20251028071341) which supports all use cases
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
BEGIN
    -- Validate that at least user_id or email is provided
    IF p_user_id IS NULL AND p_email IS NULL THEN
        RAISE EXCEPTION 'Either p_user_id or p_email must be provided';
    END IF;

    -- Determine target user_id and email
    IF p_user_id IS NOT NULL THEN
        v_target_user_id := p_user_id;
        -- Get email from user_id if not provided
        IF p_email IS NULL THEN
            SELECT email INTO v_target_email
            FROM auth.users
            WHERE id = p_user_id;
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
            p_type,
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
            p_priority
        )
        RETURNING id INTO v_notification_id;

        -- Check if email notifications are enabled
        IF v_target_user_id IS NOT NULL THEN
            v_should_send_email := public.should_send_notification(
                v_target_user_id,
                p_type,
                'email',
                p_scope,
                p_ws_id
            );
        ELSE
            -- For pending users, always send email
            v_should_send_email := TRUE;
        END IF;

        -- If email is enabled, add to delivery queue with batching
        IF v_should_send_email AND v_target_email IS NOT NULL THEN
            -- Get or create a batch for this user (10 minute window)
            v_batch_id := public.get_or_create_notification_batch(
                p_ws_id,
                v_target_user_id,
                'email',
                10,
                v_target_email
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

COMMENT ON FUNCTION public.create_notification IS 'Creates a notification with support for workspace, user, and email-based notifications. All parameters have defaults for maximum flexibility. This is the canonical version that replaced multiple conflicting overloads.';
