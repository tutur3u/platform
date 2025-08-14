-- Create a function to atomically get and update sync tokens
CREATE OR REPLACE FUNCTION public.atomic_sync_token_operation(
  p_ws_id uuid,
  p_calendar_id TEXT DEFAULT 'primary',
  p_operation TEXT DEFAULT 'get', -- 'get', 'update', 'clear'
  p_sync_token TEXT DEFAULT NULL
)
RETURNS TABLE(
  sync_token TEXT,
  last_synced_at TIMESTAMPTZ,
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sync_token TEXT;
  v_last_synced_at TIMESTAMPTZ;
BEGIN
  -- Note: PostgreSQL functions automatically run within a transaction
  -- No need for manual BEGIN/COMMIT/ROLLBACK
  
  IF p_operation = 'get' THEN
    -- Get sync token with row-level lock
    SELECT 
      sync_token, 
      last_synced_at 
    INTO v_sync_token, v_last_synced_at
    FROM calendar_sync_states 
    WHERE ws_id = p_ws_id 
      AND calendar_id = p_calendar_id
    FOR UPDATE NOWAIT; -- NOWAIT prevents blocking if row is already locked
    
    RETURN QUERY SELECT 
      COALESCE(v_sync_token, ''), 
      COALESCE(v_last_synced_at, NOW()), 
      TRUE, 
      'Sync token retrieved successfully';
      
  ELSIF p_operation = 'update' THEN
    -- Update sync token atomically
    INSERT INTO calendar_sync_states (ws_id, calendar_id, sync_token, last_synced_at)
    VALUES (p_ws_id, p_calendar_id, p_sync_token, NOW())
    ON CONFLICT (ws_id, calendar_id) 
    DO UPDATE SET 
      sync_token = EXCLUDED.sync_token,
      last_synced_at = EXCLUDED.last_synced_at;
      
    RETURN QUERY SELECT 
      p_sync_token, 
      NOW(), 
      TRUE, 
      'Sync token updated successfully';
      
  ELSIF p_operation = 'clear' THEN
    -- Clear invalid sync token
    DELETE FROM calendar_sync_states 
    WHERE ws_id = p_ws_id 
      AND calendar_id = p_calendar_id;
      
    RETURN QUERY SELECT 
      '', 
      NOW(), 
      TRUE, 
      'Sync token cleared successfully';
      
  ELSE
    RETURN QUERY SELECT 
      '', 
      NOW(), 
      FALSE, 
      'Invalid operation specified';
  END IF;
  
EXCEPTION 
  WHEN lock_not_available THEN
    -- Handle case where row is already locked
    RETURN QUERY SELECT 
      '', 
      NOW(), 
      FALSE, 
      'Row is locked by another process, try again later';
      
  WHEN OTHERS THEN
    -- Handle any other errors
    RETURN QUERY SELECT 
      '', 
      NOW(), 
      FALSE, 
      'Error: ' || SQLERRM;
END;
$$;