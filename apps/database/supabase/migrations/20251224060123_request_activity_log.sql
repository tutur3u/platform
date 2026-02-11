-- =============================================================================
-- Time Tracking Request Activity Log Migration
-- Adds: Activity log table to preserve full history of all changes
-- Tracks: Status changes, content edits, comments, and feedback
-- =============================================================================

-- =============================================================================
-- 1. CREATE ACTIVITY ACTION TYPE ENUM
-- =============================================================================
CREATE TYPE time_tracking_request_activity_action AS ENUM (
    'CREATED',
    'CONTENT_UPDATED',
    'STATUS_CHANGED',
    'COMMENT_ADDED',
    'COMMENT_UPDATED',
    'COMMENT_DELETED'
);

-- =============================================================================
-- 2. CREATE ACTIVITY LOG TABLE
-- =============================================================================
CREATE TABLE time_tracking_request_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES time_tracking_requests(id) ON DELETE CASCADE,
    action_type time_tracking_request_activity_action NOT NULL,
    
    -- Actor information
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Status change tracking
    previous_status TEXT,
    new_status TEXT,
    
    -- Feedback/reason preservation (captured before clearing)
    feedback_reason TEXT,
    
    -- Content change tracking
    changed_fields JSONB, -- Stores { field: { old: value, new: value } }
    
    -- Comment tracking
    comment_id UUID REFERENCES time_tracking_request_comments(id) ON DELETE SET NULL,
    comment_content TEXT, -- Preserved even if comment deleted
    
    -- Extensibility for future metadata
    metadata JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- =============================================================================
CREATE INDEX idx_activity_request_id ON time_tracking_request_activity(request_id);
CREATE INDEX idx_activity_actor_id ON time_tracking_request_activity(actor_id);
CREATE INDEX idx_activity_created_at ON time_tracking_request_activity(created_at DESC);
CREATE INDEX idx_activity_action_type ON time_tracking_request_activity(action_type);

-- Composite index for fetching request activity chronologically
CREATE INDEX idx_activity_request_created ON time_tracking_request_activity(request_id, created_at DESC);

-- =============================================================================
-- 4. TRIGGER: LOG REQUEST CREATION
-- =============================================================================
CREATE OR REPLACE FUNCTION log_time_tracking_request_creation()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO time_tracking_request_activity (
        request_id,
        action_type,
        actor_id,
        new_status,
        metadata
    ) VALUES (
        NEW.id,
        'CREATED',
        NEW.user_id,
        NEW.approval_status::TEXT,
        jsonb_build_object(
            'title', NEW.title,
            'start_time', NEW.start_time,
            'end_time', NEW.end_time
        )
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_request_creation
    AFTER INSERT ON time_tracking_requests
    FOR EACH ROW
    EXECUTE FUNCTION log_time_tracking_request_creation();

-- =============================================================================
-- 5. TRIGGER: LOG CONTENT UPDATES
-- =============================================================================
CREATE OR REPLACE FUNCTION log_time_tracking_request_update()
RETURNS TRIGGER AS $$
DECLARE
    v_changed_fields JSONB := '{}'::JSONB;
    v_status_changed BOOLEAN := FALSE;
    v_content_changed BOOLEAN := FALSE;
BEGIN
    -- Track status changes
    IF OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
        v_status_changed := TRUE;
    END IF;
    
    -- Track content field changes
    IF OLD.title IS DISTINCT FROM NEW.title THEN
        v_changed_fields := jsonb_set(v_changed_fields, '{title}', jsonb_build_object('old', OLD.title, 'new', NEW.title));
        v_content_changed := TRUE;
    END IF;
    
    IF OLD.description IS DISTINCT FROM NEW.description THEN
        v_changed_fields := jsonb_set(v_changed_fields, '{description}', jsonb_build_object('old', OLD.description, 'new', NEW.description));
        v_content_changed := TRUE;
    END IF;
    
    IF OLD.start_time IS DISTINCT FROM NEW.start_time THEN
        v_changed_fields := jsonb_set(v_changed_fields, '{start_time}', jsonb_build_object('old', OLD.start_time, 'new', NEW.start_time));
        v_content_changed := TRUE;
    END IF;
    
    IF OLD.end_time IS DISTINCT FROM NEW.end_time THEN
        v_changed_fields := jsonb_set(v_changed_fields, '{end_time}', jsonb_build_object('old', OLD.end_time, 'new', NEW.end_time));
        v_content_changed := TRUE;
    END IF;
    
    IF OLD.task_id IS DISTINCT FROM NEW.task_id THEN
        v_changed_fields := jsonb_set(v_changed_fields, '{task_id}', jsonb_build_object('old', OLD.task_id, 'new', NEW.task_id));
        v_content_changed := TRUE;
    END IF;
    
    IF OLD.category_id IS DISTINCT FROM NEW.category_id THEN
        v_changed_fields := jsonb_set(v_changed_fields, '{category_id}', jsonb_build_object('old', OLD.category_id, 'new', NEW.category_id));
        v_content_changed := TRUE;
    END IF;
    
    IF OLD.images IS DISTINCT FROM NEW.images THEN
        v_changed_fields := jsonb_set(v_changed_fields, '{images}', jsonb_build_object('old', OLD.images, 'new', NEW.images));
        v_content_changed := TRUE;
    END IF;
    
    -- Log status change separately with feedback preservation
    IF v_status_changed THEN
        INSERT INTO time_tracking_request_activity (
            request_id,
            action_type,
            actor_id,
            previous_status,
            new_status,
            feedback_reason,
            metadata
        ) VALUES (
            NEW.id,
            'STATUS_CHANGED',
            auth.uid(),
            OLD.approval_status::TEXT,
            NEW.approval_status::TEXT,
            -- Capture feedback when transitioning TO statuses that have feedback fields
            CASE 
                WHEN NEW.approval_status::TEXT = 'NEEDS_INFO' AND NEW.needs_info_reason IS NOT NULL 
                THEN NEW.needs_info_reason
                WHEN NEW.approval_status::TEXT = 'REJECTED' AND NEW.rejection_reason IS NOT NULL 
                THEN NEW.rejection_reason
                ELSE NULL
            END,
            jsonb_build_object(
                'approved_by', NEW.approved_by,
                'rejected_by', NEW.rejected_by,
                'needs_info_requested_by', NEW.needs_info_requested_by
            )
        );
    END IF;
    
    -- Log content changes
    IF v_content_changed THEN
        INSERT INTO time_tracking_request_activity (
            request_id,
            action_type,
            actor_id,
            changed_fields
        ) VALUES (
            NEW.id,
            'CONTENT_UPDATED',
            auth.uid(),
            v_changed_fields
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_request_update
    AFTER UPDATE ON time_tracking_requests
    FOR EACH ROW
    EXECUTE FUNCTION log_time_tracking_request_update();

-- =============================================================================
-- 6. TRIGGER: LOG COMMENT ACTIVITY
-- =============================================================================
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
            OLD.id,
            OLD.content
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_comment_activity
    AFTER INSERT OR UPDATE OR DELETE ON time_tracking_request_comments
    FOR EACH ROW
    EXECUTE FUNCTION log_time_tracking_comment_activity();

-- =============================================================================
-- 7. RLS POLICIES FOR ACTIVITY LOG
-- =============================================================================
ALTER TABLE time_tracking_request_activity ENABLE ROW LEVEL SECURITY;

-- Read: Users who can view the request can view its activity
CREATE POLICY "Allow request viewers to see activity"
ON time_tracking_request_activity FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM time_tracking_requests r
        WHERE r.id = request_id
        AND (
            -- Owner can view their own request activity
            r.user_id = auth.uid()
            -- OR user has manage permission
            OR has_workspace_permission(r.workspace_id, auth.uid(), 'manage_time_tracking_requests'::text)
        )
    )
);

-- Insert/Update/Delete: Only through triggers (no direct manipulation)
-- No INSERT/UPDATE/DELETE policies - activity is append-only via triggers

-- =============================================================================
-- 8. GRANT PERMISSIONS
-- =============================================================================
GRANT SELECT ON time_tracking_request_activity TO authenticated;

-- =============================================================================
-- 9. HELPFUL VIEW: ACTIVITY WITH USER DETAILS
-- =============================================================================
CREATE OR REPLACE VIEW time_tracking_request_activity_with_users AS
SELECT 
    a.*,
    u.display_name as actor_display_name,
    u.handle as actor_handle,
    u.avatar_url as actor_avatar_url
FROM time_tracking_request_activity a
LEFT JOIN users u ON a.actor_id = u.id;

GRANT SELECT ON time_tracking_request_activity_with_users TO authenticated;
