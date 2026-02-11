-- Create RPC function to atomically set default break type
-- This prevents race conditions where unsetting others might succeed but setting the target fails,
-- leaving no default break type.

CREATE OR REPLACE FUNCTION set_default_break_type(
  p_ws_id UUID,
  p_target_id UUID
)
RETURNS TABLE (
  id UUID,
  ws_id UUID,
  name TEXT,
  description TEXT,
  color TEXT,
  icon TEXT,
  is_default BOOLEAN,
  created_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- First, unset all other defaults in this workspace
  UPDATE workspace_break_types
  SET is_default = false
  WHERE workspace_break_types.ws_id = p_ws_id
    AND workspace_break_types.id != p_target_id;

  -- Then, set the target as default and return it
  RETURN QUERY
  UPDATE workspace_break_types
  SET is_default = true
  WHERE workspace_break_types.ws_id = p_ws_id
    AND workspace_break_types.id = p_target_id
  RETURNING 
    workspace_break_types.id,
    workspace_break_types.ws_id,
    workspace_break_types.name,
    workspace_break_types.description,
    workspace_break_types.color,
    workspace_break_types.icon,
    workspace_break_types.is_default,
    workspace_break_types.created_at;
END;
$$;
