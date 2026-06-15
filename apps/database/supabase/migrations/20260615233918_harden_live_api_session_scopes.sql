ALTER TABLE public.live_api_sessions
ADD CONSTRAINT live_api_sessions_scope_key_format_check
CHECK (
  length(scope_key) <= 80
  AND (
    scope_key IN (
      'legacy:default',
      'mira:default',
      'assistant:web-dashboard'
    )
    OR scope_key ~ '^assistant:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  )
) NOT VALID;

ALTER TABLE public.live_api_sessions
ADD CONSTRAINT live_api_sessions_session_handle_length_check
CHECK (length(session_handle) <= 8192) NOT VALID;
