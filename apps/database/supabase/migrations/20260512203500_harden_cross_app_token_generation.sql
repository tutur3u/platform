-- Harden cross-app token helpers so callers can only mint or revoke their own tokens.
CREATE OR REPLACE FUNCTION public.generate_cross_app_token(
  p_user_id UUID,
  p_origin_app TEXT,
  p_target_app TEXT,
  p_expiry_seconds INT DEFAULT 300
)
RETURNS TEXT AS $$
DECLARE
  v_token TEXT;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Cannot generate cross-app token for another user'
      USING ERRCODE = '42501';
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

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

  RETURN v_token;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp;

CREATE OR REPLACE FUNCTION public.generate_cross_app_token(
  p_user_id UUID,
  p_origin_app TEXT,
  p_target_app TEXT,
  p_expiry_seconds INT DEFAULT 300,
  p_session_data JSONB DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_token TEXT;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Cannot generate cross-app token for another user'
      USING ERRCODE = '42501';
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

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

  RETURN v_token;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp;

CREATE OR REPLACE FUNCTION public.revoke_all_cross_app_tokens(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Cannot revoke cross-app tokens for another user'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.cross_app_tokens
  SET is_revoked = true
  WHERE user_id = p_user_id AND is_revoked = false;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.generate_cross_app_token(UUID, TEXT, TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_cross_app_token(UUID, TEXT, TEXT, INT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_all_cross_app_tokens(UUID) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.generate_cross_app_token(UUID, TEXT, TEXT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_cross_app_token(UUID, TEXT, TEXT, INT, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_all_cross_app_tokens(UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.generate_cross_app_token(UUID, TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_cross_app_token(UUID, TEXT, TEXT, INT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_all_cross_app_tokens(UUID) TO authenticated;
