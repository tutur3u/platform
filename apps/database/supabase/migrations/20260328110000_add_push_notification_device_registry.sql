-- ============================================================================
-- ADD MOBILE PUSH DEVICE REGISTRY AND PUSH DELIVERY QUEUEING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notification_push_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    token TEXT NOT NULL,
    platform TEXT NOT NULL,
    app_flavor TEXT NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT notification_push_devices_platform_check
        CHECK (platform IN ('android', 'ios')),
    CONSTRAINT notification_push_devices_app_flavor_check
        CHECK (app_flavor IN ('development', 'staging', 'production'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_push_devices_token
    ON public.notification_push_devices(token);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_push_devices_user_device_flavor
    ON public.notification_push_devices(user_id, device_id, app_flavor);

CREATE INDEX IF NOT EXISTS idx_notification_push_devices_user
    ON public.notification_push_devices(user_id, app_flavor);

ALTER TABLE public.notification_push_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own push devices" ON public.notification_push_devices;
CREATE POLICY "Users can view their own push devices"
    ON public.notification_push_devices
    FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own push devices" ON public.notification_push_devices;
CREATE POLICY "Users can insert their own push devices"
    ON public.notification_push_devices
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own push devices" ON public.notification_push_devices;
CREATE POLICY "Users can update their own push devices"
    ON public.notification_push_devices
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own push devices" ON public.notification_push_devices;
CREATE POLICY "Users can delete their own push devices"
    ON public.notification_push_devices
    FOR DELETE
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role can manage push devices" ON public.notification_push_devices;
CREATE POLICY "Service role can manage push devices"
    ON public.notification_push_devices
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.update_notification_push_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_notification_push_devices_updated_at
    ON public.notification_push_devices;
CREATE TRIGGER update_notification_push_devices_updated_at
    BEFORE UPDATE ON public.notification_push_devices
    FOR EACH ROW
    EXECUTE FUNCTION public.update_notification_push_devices_updated_at();

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
    v_should_send_web BOOLEAN := FALSE;
    v_should_send_email BOOLEAN := FALSE;
    v_should_send_push BOOLEAN := FALSE;
    v_should_create_notification BOOLEAN := FALSE;
    v_email_batch_id UUID;
    v_push_batch_id UUID;
    v_target_user_id UUID;
    v_target_email TEXT;
    v_email_config RECORD;
    v_notification_key TEXT;
    v_email_delivery_mode public.notification_delivery_mode;
    v_push_delivery_mode public.notification_delivery_mode;
    v_email_batch_window INTEGER;
    v_push_batch_window INTEGER;
    v_final_priority public.notification_priority;
BEGIN
    SET LOCAL search_path = pg_temp, public;

    IF p_user_id IS NULL AND p_email IS NULL THEN
        RAISE EXCEPTION 'Either p_user_id or p_email must be provided';
    END IF;

    v_notification_key := COALESCE(p_type, p_code);

    SELECT * INTO v_email_config
    FROM public.get_notification_email_config(v_notification_key);

    v_email_delivery_mode := COALESCE(v_email_config.delivery_mode, 'batched');
    v_email_batch_window := COALESCE(v_email_config.batch_window_minutes, 10);
    v_final_priority := COALESCE(v_email_config.priority_override, p_priority);

    v_push_delivery_mode := CASE
        WHEN v_notification_key IN (
            'workspace_invite',
            'task_mention',
            'security_alert',
            'account_update'
        ) THEN 'immediate'::public.notification_delivery_mode
        ELSE 'batched'::public.notification_delivery_mode
    END;

    v_push_batch_window := CASE
        WHEN v_notification_key = 'task_mention' THEN 5
        ELSE v_email_batch_window
    END;

    IF p_user_id IS NOT NULL THEN
        v_target_user_id := p_user_id;
        IF p_email IS NULL THEN
            SELECT email INTO v_target_email
            FROM public.user_private_details
            WHERE user_id = p_user_id;
        ELSE
            v_target_email := p_email;
        END IF;
    ELSE
        v_target_user_id := NULL;
        v_target_email := p_email;
    END IF;

    IF v_target_user_id IS NOT NULL THEN
        v_should_send_web := public.should_send_notification(
            v_target_user_id,
            v_notification_key,
            'web',
            p_scope,
            p_ws_id
        );

        v_should_send_email := v_target_email IS NOT NULL AND public.should_send_notification(
            v_target_user_id,
            v_notification_key,
            'email',
            p_scope,
            p_ws_id
        );

        v_should_send_push := public.should_send_notification(
            v_target_user_id,
            v_notification_key,
            'push',
            p_scope,
            p_ws_id
        );
    ELSE
        -- Pending-email users should still receive a persisted notification and email invite.
        v_should_send_web := TRUE;
        v_should_send_email := TRUE;
        v_should_send_push := FALSE;
    END IF;

    v_should_create_notification :=
        COALESCE(v_should_send_web, FALSE)
        OR COALESCE(v_should_send_email, FALSE)
        OR COALESCE(v_should_send_push, FALSE);

    IF v_should_create_notification THEN
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

        IF v_should_send_email AND v_target_email IS NOT NULL THEN
            v_email_batch_id := public.get_or_create_notification_batch(
                p_ws_id,
                v_target_user_id,
                'email',
                v_email_batch_window,
                v_target_email,
                v_email_delivery_mode
            );

            INSERT INTO public.notification_delivery_log (
                notification_id,
                channel,
                status,
                batch_id
            ) VALUES (
                v_notification_id,
                'email',
                'pending',
                v_email_batch_id
            );

            UPDATE public.notification_batches
            SET notification_count = notification_count + 1
            WHERE id = v_email_batch_id;
        END IF;

        IF v_should_send_push AND v_target_user_id IS NOT NULL THEN
            v_push_batch_id := public.get_or_create_notification_batch(
                p_ws_id,
                v_target_user_id,
                'push',
                v_push_batch_window,
                NULL,
                v_push_delivery_mode
            );

            INSERT INTO public.notification_delivery_log (
                notification_id,
                channel,
                status,
                batch_id
            ) VALUES (
                v_notification_id,
                'push',
                'pending',
                v_push_batch_id
            );

            UPDATE public.notification_batches
            SET notification_count = notification_count + 1
            WHERE id = v_push_batch_id;
        END IF;

        RETURN v_notification_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.notification_push_devices IS 'Mobile push device registrations for FCM delivery.';
COMMENT ON COLUMN public.notification_push_devices.device_id IS 'Stable app-level device identifier used to upsert registrations.';
COMMENT ON COLUMN public.notification_push_devices.token IS 'FCM registration token for the device.';
COMMENT ON COLUMN public.notification_push_devices.app_flavor IS 'Mobile app flavor that registered this token.';
