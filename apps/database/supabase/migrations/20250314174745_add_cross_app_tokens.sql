-- Create a new table for cross-app authentication tokens
CREATE TABLE IF NOT EXISTS public.cross_app_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  origin_app TEXT NOT NULL,
  target_app TEXT NOT NULL
);

-- Create an index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_cross_app_tokens_token ON public.cross_app_tokens(token);

-- Create an index for user_id to quickly find all tokens for a user
CREATE INDEX IF NOT EXISTS idx_cross_app_tokens_user_id ON public.cross_app_tokens(user_id);

-- Create a function to clean up expired tokens
CREATE OR REPLACE FUNCTION public.cleanup_expired_cross_app_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM public.cross_app_tokens
  WHERE expires_at < now() OR (used_at IS NOT NULL AND used_at < now() - INTERVAL '1 hour');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to automatically clean up expired tokens
CREATE OR REPLACE FUNCTION public.trigger_cleanup_expired_cross_app_tokens()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.cleanup_expired_cross_app_tokens();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger that runs the cleanup function periodically
DROP TRIGGER IF EXISTS trigger_cleanup_expired_cross_app_tokens ON public.cross_app_tokens;
CREATE TRIGGER trigger_cleanup_expired_cross_app_tokens
AFTER INSERT ON public.cross_app_tokens
FOR EACH STATEMENT
EXECUTE FUNCTION public.trigger_cleanup_expired_cross_app_tokens();

-- Create a function to generate a new cross-app token
CREATE OR REPLACE FUNCTION public.generate_cross_app_token(
  p_user_id UUID,
  p_origin_app TEXT,
  p_target_app TEXT,
  p_expiry_seconds INT DEFAULT 300 -- 5 minutes by default
)
RETURNS TEXT AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Generate a secure random token
  v_token := encode(gen_random_bytes(32), 'hex');
  
  -- Insert the token into the database
  INSERT INTO public.cross_app_tokens (
    user_id,
    token,
    expires_at,
    origin_app,
    target_app
  ) VALUES (
    p_user_id,
    v_token,
    now() + (p_expiry_seconds * INTERVAL '1 second'),
    p_origin_app,
    p_target_app
  );
  
  -- Return the token
  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to validate a cross-app token
CREATE OR REPLACE FUNCTION public.validate_cross_app_token(
  p_token TEXT,
  p_target_app TEXT
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Find the token and get the user_id if it's valid
  SELECT user_id INTO v_user_id
  FROM public.cross_app_tokens
  WHERE token = p_token
    AND target_app = p_target_app
    AND expires_at > now()
    AND used_at IS NULL
    AND is_revoked = false;
  
  -- If the token is valid, mark it as used
  IF v_user_id IS NOT NULL THEN
    UPDATE public.cross_app_tokens
    SET used_at = now()
    WHERE token = p_token;
  END IF;
  
  -- Return the user_id (will be NULL if token is invalid)
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create RLS policies for the cross_app_tokens table
ALTER TABLE public.cross_app_tokens ENABLE ROW LEVEL SECURITY;

-- Only allow users to see their own tokens
CREATE POLICY select_own_tokens ON public.cross_app_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

-- Only allow the system to insert tokens (via the function)
CREATE POLICY insert_system_only ON public.cross_app_tokens
  FOR INSERT
  WITH CHECK (false);

-- Only allow the system to update tokens (via the function)
CREATE POLICY update_system_only ON public.cross_app_tokens
  FOR UPDATE
  USING (false);

-- Only allow the system to delete tokens
CREATE POLICY delete_system_only ON public.cross_app_tokens
  FOR DELETE
  USING (false);

-- Grant necessary permissions to the authenticated role
GRANT SELECT ON public.cross_app_tokens TO authenticated;

-- Create a function to revoke all tokens for a user
CREATE OR REPLACE FUNCTION public.revoke_all_cross_app_tokens(p_user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.cross_app_tokens
  SET is_revoked = true
  WHERE user_id = p_user_id AND is_revoked = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
