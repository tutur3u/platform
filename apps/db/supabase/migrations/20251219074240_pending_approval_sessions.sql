-- Add pending_approval flag to sessions
-- This indicates a session that has a pending approval request and shouldn't appear in session history yet
ALTER TABLE public.time_tracking_sessions
ADD COLUMN IF NOT EXISTS pending_approval BOOLEAN NOT NULL DEFAULT false;

-- Add linked_session_id to requests
-- This links a request to an existing session (for break pauses or session time approval)
ALTER TABLE public.time_tracking_requests
ADD COLUMN IF NOT EXISTS linked_session_id UUID REFERENCES public.time_tracking_sessions(id) ON DELETE SET NULL;

-- Create index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_time_tracking_sessions_pending_approval 
ON public.time_tracking_sessions(pending_approval) 
WHERE pending_approval = true;

CREATE INDEX IF NOT EXISTS idx_time_tracking_requests_linked_session 
ON public.time_tracking_requests(linked_session_id) 
WHERE linked_session_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.time_tracking_sessions.pending_approval IS 
  'True when session has a pending approval request. Sessions with pending_approval=true should not appear in session history until approved.';

COMMENT ON COLUMN public.time_tracking_requests.linked_session_id IS 
  'References an existing session that this request is approving. Used for break pauses where the session needs to remain for the break record. On approval, the session becomes visible; on rejection, the session is deleted.';

-- Function to handle request approval for linked sessions
CREATE OR REPLACE FUNCTION public.handle_request_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Only process if status changed
  IF OLD.approval_status = NEW.approval_status THEN
    RETURN NEW;
  END IF;

  -- If request has a linked session
  IF NEW.linked_session_id IS NOT NULL THEN
    IF NEW.approval_status = 'APPROVED' THEN
      -- On approval, clear the pending_approval flag so session appears in history
      UPDATE time_tracking_sessions
      SET pending_approval = false,
          updated_at = NOW()
      WHERE id = NEW.linked_session_id;
    ELSIF NEW.approval_status = 'REJECTED' THEN
      -- On rejection, delete the linked session (cascade will delete breaks)
      DELETE FROM time_tracking_sessions
      WHERE id = NEW.linked_session_id;
      -- Clear the reference since session is deleted
      NEW.linked_session_id := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Create trigger for request status changes
DROP TRIGGER IF EXISTS trigger_handle_request_status_change ON public.time_tracking_requests;
CREATE TRIGGER trigger_handle_request_status_change
  BEFORE UPDATE ON public.time_tracking_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_request_status_change();

-- Update the pause_session_for_break function to also set pending_approval
CREATE OR REPLACE FUNCTION public.pause_session_for_break(
    p_session_id UUID,
    p_end_time TIMESTAMPTZ,
    p_duration_seconds INTEGER,
    p_pending_approval BOOLEAN DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_session RECORD;
    v_result json;
BEGIN
    -- Set the bypass flag for this transaction
    PERFORM set_config('time_tracking.is_break_pause', 'on', true);
    
    -- Update the session
    UPDATE time_tracking_sessions
    SET 
        end_time = p_end_time,
        duration_seconds = p_duration_seconds,
        is_running = false,
        pending_approval = COALESCE(p_pending_approval, false),
        updated_at = NOW()
    WHERE id = p_session_id
    RETURNING * INTO v_session;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found';
    END IF;
    
    -- Return the updated session as JSON
    SELECT json_build_object(
        'id', v_session.id,
        'ws_id', v_session.ws_id,
        'user_id', v_session.user_id,
        'title', v_session.title,
        'description', v_session.description,
        'category_id', v_session.category_id,
        'task_id', v_session.task_id,
        'start_time', v_session.start_time,
        'end_time', v_session.end_time,
        'duration_seconds', v_session.duration_seconds,
        'is_running', v_session.is_running,
        'was_resumed', v_session.was_resumed,
        'parent_session_id', v_session.parent_session_id,
        'pending_approval', v_session.pending_approval,
        'created_at', v_session.created_at,
        'updated_at', v_session.updated_at
    ) INTO v_result;
    
    RETURN v_result;
END;
$function$;

