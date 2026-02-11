create type "public"."platform_service" as enum ('TUTURUUU', 'REWISE', 'NOVA', 'UPSKII');

alter table "public"."users" add column "services" platform_service[] DEFAULT '{TUTURUUU}';

ALTER TABLE public.users
  ALTER COLUMN services SET DEFAULT '{TUTURUUU}',
  ALTER COLUMN services SET NOT NULL;

-- Update existing users to have the default service if they don't have any services
UPDATE public.users 
SET services = '{TUTURUUU}'::platform_service[]
WHERE services IS NULL;

CREATE OR REPLACE FUNCTION public.validate_cross_app_token_with_session(
  p_token TEXT,
  p_target_app TEXT
)
RETURNS TABLE(user_id UUID, session_data JSONB) AS $$
DECLARE
  v_record RECORD;
  v_required_service platform_service;
  v_user_services platform_service[];
BEGIN
  -- Find the token and get the user_id, session_data, and origin_app if it's valid
  SELECT t.user_id, t.session_data, t.origin_app INTO v_record
  FROM public.cross_app_tokens t
  WHERE t.token = p_token
    AND t.target_app = p_target_app
    AND t.expires_at > now()
    AND t.used_at IS NULL
    AND t.is_revoked = false;
  
  -- Log the found record for debugging
  RAISE NOTICE 'Found token record: user_id=%, session_data=%, origin_app=%', v_record.user_id, v_record.session_data, v_record.origin_app;
  
  -- If the token is valid, check additional permissions for service access
  IF v_record.user_id IS NOT NULL THEN
    -- If origin app is web, check that user has the required service for the target app
    IF v_record.origin_app = 'web' THEN
      -- Map target app to required platform service
      CASE p_target_app
        WHEN 'platform' THEN v_required_service := 'TUTURUUU';
        WHEN 'rewise' THEN v_required_service := 'REWISE';
        WHEN 'nova' THEN v_required_service := 'NOVA';
        WHEN 'upskii' THEN v_required_service := 'UPSKII';
        ELSE v_required_service := NULL;
      END CASE;
      
      -- Get user's services
      SELECT COALESCE(services, '{}'::platform_service[]) INTO v_user_services
      FROM public.users
      WHERE id = v_record.user_id;
      
      -- Add the required service if user doesn't have it yet
      IF v_required_service IS NOT NULL AND NOT (v_required_service = ANY(v_user_services)) THEN
        RAISE NOTICE 'Adding missing service % for user % accessing target app %', v_required_service, v_record.user_id, p_target_app;
        -- Add the service to the user's services array
        UPDATE public.users
        SET services = array_append(services, v_required_service)
        WHERE id = v_record.user_id;
      END IF;
    END IF;
    
    -- Mark token as used
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