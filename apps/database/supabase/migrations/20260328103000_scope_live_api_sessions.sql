ALTER TABLE public.live_api_sessions
ADD COLUMN IF NOT EXISTS scope_key TEXT;

UPDATE public.live_api_sessions
SET scope_key = COALESCE(scope_key, 'legacy:default')
WHERE scope_key IS NULL;

ALTER TABLE public.live_api_sessions
ALTER COLUMN scope_key SET NOT NULL;

ALTER TABLE public.live_api_sessions
DROP CONSTRAINT IF EXISTS live_api_sessions_user_id_ws_id_key;

ALTER TABLE public.live_api_sessions
ADD CONSTRAINT live_api_sessions_user_id_ws_id_scope_key_key
UNIQUE (user_id, ws_id, scope_key);

CREATE INDEX IF NOT EXISTS idx_live_api_sessions_user_ws_scope
ON public.live_api_sessions(user_id, ws_id, scope_key);
