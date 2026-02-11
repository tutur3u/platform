-- Add session data to cross_app_tokens table
ALTER TABLE public.cross_app_tokens 
ADD COLUMN session_data JSONB;

-- Update the generate_cross_app_token function to store session data
CREATE OR REPLACE FUNCTION public.generate_cross_app_token(
  p_user_id UUID,
  p_origin_app TEXT,
  p_target_app TEXT,
  p_expiry_seconds INT DEFAULT 300, -- 5 minutes by default
  p_session_data JSONB DEFAULT NULL -- Session data passed from the client
)
RETURNS TEXT AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Generate a secure random token
  v_token := encode(gen_random_bytes(32), 'hex');
  
  -- Log the session data for debugging
  RAISE NOTICE 'Storing session data: %', p_session_data;
  
  -- Insert the token into the database with session data
  INSERT INTO public.cross_app_tokens (
    user_id,
    token,
    expires_at,
    origin_app,
    target_app,
    session_data
  ) VALUES (
    p_user_id,
    v_token,
    now() + (p_expiry_seconds * INTERVAL '1 second'),
    p_origin_app,
    p_target_app,
    p_session_data
  );
  
  -- Return the token
  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a new function to validate token and return session data
-- We can't modify the return type of the existing function
CREATE OR REPLACE FUNCTION public.validate_cross_app_token_with_session(
  p_token TEXT,
  p_target_app TEXT
)
RETURNS TABLE(user_id UUID, session_data JSONB) AS $$
DECLARE
  v_record RECORD;
BEGIN
  -- Find the token and get the user_id and session_data if it's valid
  SELECT t.user_id, t.session_data INTO v_record
  FROM public.cross_app_tokens t
  WHERE t.token = p_token
    AND t.target_app = p_target_app
    AND t.expires_at > now()
    AND t.used_at IS NULL
    AND t.is_revoked = false;
  
  -- Log the found record for debugging
  RAISE NOTICE 'Found token record: user_id=%, session_data=%', v_record.user_id, v_record.session_data;
  
  -- If the token is valid, mark it as used
  IF v_record.user_id IS NOT NULL THEN
    UPDATE public.cross_app_tokens
    SET used_at = now()
    WHERE token = p_token;
    
    -- Return the user_id and session_data
    RETURN QUERY SELECT v_record.user_id, v_record.session_data;
  ELSE
    -- Return NULL if token is invalid
    RETURN QUERY SELECT NULL::UUID, NULL::JSONB;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the existing validate_cross_app_token function to use session data internally
CREATE OR REPLACE FUNCTION public.validate_cross_app_token(
  p_token TEXT,
  p_target_app TEXT
)
RETURNS UUID AS $$
DECLARE
  v_result RECORD;
BEGIN
  -- Use the new function but only return the user_id to maintain compatibility
  SELECT * INTO v_result FROM validate_cross_app_token_with_session(p_token, p_target_app);
  RETURN v_result.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
