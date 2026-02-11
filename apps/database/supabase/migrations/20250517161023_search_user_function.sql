CREATE OR REPLACE FUNCTION search_users(
  search_query TEXT,
  page_number INTEGER,
  page_size INTEGER
)
RETURNS TABLE (
  -- User columns
  id UUID,
  display_name TEXT,
  deleted BOOLEAN,
  avatar_url TEXT,
  handle TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ,
  
  -- PlatformUser columns
  user_id UUID,
  enabled BOOLEAN,
  allow_challenge_management BOOLEAN,
  allow_manage_all_challenges BOOLEAN,
  allow_role_management BOOLEAN,
  
  -- UserPrivateDetails columns
  email TEXT,
  new_email TEXT,
  birthday DATE,
  
  -- Team names as array
  team_name TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    -- User columns
    u.id,
    u.display_name,
    u.deleted,
    u.avatar_url,
    u.handle,
    u.bio,
    u.created_at,
    
    -- PlatformUser columns
    ur.user_id,
    ur.enabled,
    ur.allow_challenge_management,
    ur.allow_manage_all_challenges,
    ur.allow_role_management,
    
    -- UserPrivateDetails columns
    ud.email,
    ud.new_email,
    ud.birthday,
    
    -- Team names
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT t.name), NULL) as team_name
    
  FROM platform_user_roles ur
  JOIN users u ON ur.user_id = u.id
  JOIN user_private_details ud ON u.id = ud.user_id
  LEFT JOIN nova_team_members tm ON u.id = tm.user_id
  LEFT JOIN nova_teams t ON tm.team_id = t.id
  
  WHERE 
    u.display_name ILIKE '%' || search_query || '%' OR
    ud.email ILIKE '%' || search_query || '%'
  
  GROUP BY 
    u.id,
    u.display_name,
    u.deleted,
    u.avatar_url,
    u.handle,
    u.bio,
    u.created_at,
    ur.user_id,
    ur.enabled,
    ur.allow_challenge_management,
    ur.allow_manage_all_challenges,
    ur.allow_role_management,
    ud.email,
    ud.new_email,
    ud.birthday
  
  ORDER BY u.display_name
  LIMIT page_size
  OFFSET (page_number - 1) * page_size;
END;
$$ LANGUAGE plpgsql;