CREATE OR REPLACE FUNCTION upsert_workspace_subscription_error(
  _ws_id uuid,
  _error_message text,
  _error_source text DEFAULT 'unknown'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO workspace_subscription_errors (ws_id, error_message, error_source)
  VALUES (_ws_id, _error_message, _error_source)
  ON CONFLICT (ws_id) WHERE resolved_at IS NULL
  DO UPDATE SET
    error_message = EXCLUDED.error_message,
    error_source  = EXCLUDED.error_source,
    created_at    = now();
END;
$$;
