-- Prevent FK violations when logging deleted time tracking comments.
CREATE OR REPLACE FUNCTION log_time_tracking_comment_activity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO time_tracking_request_activity (
            request_id,
            action_type,
            actor_id,
            comment_id,
            comment_content
        ) VALUES (
            NEW.request_id,
            'COMMENT_ADDED',
            NEW.user_id,
            NEW.id,
            NEW.content
        );

    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO time_tracking_request_activity (
            request_id,
            action_type,
            actor_id,
            comment_id,
            comment_content,
            changed_fields
        ) VALUES (
            NEW.request_id,
            'COMMENT_UPDATED',
            NEW.user_id,
            NEW.id,
            NEW.content,
            jsonb_build_object(
                'content', jsonb_build_object('old', OLD.content, 'new', NEW.content)
            )
        );

    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO time_tracking_request_activity (
            request_id,
            action_type,
            actor_id,
            comment_id,
            comment_content
        ) VALUES (
            OLD.request_id,
            'COMMENT_DELETED',
            OLD.user_id,
            NULL,
            OLD.content
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
