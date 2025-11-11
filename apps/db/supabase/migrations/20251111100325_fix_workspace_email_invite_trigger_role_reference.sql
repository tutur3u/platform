-- Fix notify_workspace_email_invite trigger to remove reference to dropped 'role' column
-- The 'role' column was removed from workspace_email_invites in migration 20251104101455
-- but the notification trigger was still referencing it

CREATE OR REPLACE FUNCTION public.notify_workspace_email_invite()
RETURNS TRIGGER AS $$
DECLARE
    v_workspace_name TEXT;
    v_inviter_name TEXT;
    v_inviter_email TEXT;
    v_notification_id UUID;
BEGIN
    -- Get workspace details
    SELECT name INTO v_workspace_name
    FROM public.workspaces
    WHERE id = NEW.ws_id;

    -- Get inviter name (if available)
    IF NEW.invited_by IS NOT NULL THEN
        -- Get display name from public.users
        SELECT display_name INTO v_inviter_name
        FROM public.users
        WHERE id = NEW.invited_by;

        -- Get email from auth.users if display name is null
        IF v_inviter_name IS NULL THEN
            SELECT email INTO v_inviter_email
            FROM auth.users
            WHERE id = NEW.invited_by;

            v_inviter_name := v_inviter_email;
        END IF;
    END IF;

    -- Create notification for the invitee (email-based, no user_id yet)
    -- Note: user-scoped notifications must have ws_id = NULL per constraint
    -- Note: role column was removed from workspace_email_invites in migration 20251104101455
    v_notification_id := public.create_notification(
        p_ws_id := NULL,
        p_user_id := NULL,  -- No user_id yet
        p_email := NEW.email,
        p_type := 'workspace_invite',
        p_code := 'workspace_invite',
        p_title := 'You have been invited to join a workspace',
        p_description := COALESCE(v_inviter_name, 'Someone') || ' invited you to join "' || v_workspace_name || '"',
        p_data := jsonb_build_object(
            'workspace_id', NEW.ws_id,
            'workspace_name', v_workspace_name,
            'inviter_id', NEW.invited_by,
            'inviter_name', v_inviter_name,
            'email', NEW.email
            -- Removed 'role' reference as column no longer exists
        ),
        p_entity_type := 'workspace_invite',
        p_entity_id := NEW.ws_id,
        p_created_by := NEW.invited_by,
        p_scope := 'user',
        p_priority := 'high'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
