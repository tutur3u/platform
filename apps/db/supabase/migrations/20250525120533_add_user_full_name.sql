alter table "public"."user_private_details" add column "full_name" text;

DROP FUNCTION IF EXISTS search_users(TEXT, INTEGER, INTEGER, TEXT, BOOLEAN);

CREATE FUNCTION search_users(
  search_query TEXT,
  page_number INTEGER,
  page_size INTEGER,
  role_filter TEXT DEFAULT NULL,
  enabled_filter BOOLEAN DEFAULT NULL
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
  full_name TEXT,
  
  -- Team names as array
  team_name TEXT[]
) AS $$
DECLARE
  where_clause TEXT := '';
BEGIN
  -- Base where condition
  where_clause := 'u.display_name ILIKE ''%'' || $1 || ''%'' OR ud.email ILIKE ''%'' || $1 || ''%''';
  
  -- Add role filter if provided
  IF role_filter IS NOT NULL THEN
    CASE role_filter
      WHEN 'admin' THEN
        where_clause := where_clause || ' AND ur.allow_role_management = true';
      WHEN 'global_manager' THEN
        where_clause := where_clause || ' AND ur.allow_manage_all_challenges = true';
      WHEN 'challenge_manager' THEN
        where_clause := where_clause || ' AND ur.allow_challenge_management = true';
      WHEN 'member' THEN
        where_clause := where_clause || ' AND ur.allow_challenge_management = false AND ur.allow_manage_all_challenges = false AND ur.allow_role_management = false';
      ELSE
        -- No additional filter for 'all' or other values
    END CASE;
  END IF;
  
  -- Add enabled filter if provided
  IF enabled_filter IS NOT NULL THEN
    where_clause := where_clause || ' AND ur.enabled = ' || enabled_filter::TEXT;
  END IF;
  
  -- Execute dynamic query
  RETURN QUERY EXECUTE '
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
      ud.full_name,
      
      -- Team names
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT t.name), NULL) as team_name
      
    FROM platform_user_roles ur
    JOIN users u ON ur.user_id = u.id
    JOIN user_private_details ud ON u.id = ud.user_id
    LEFT JOIN nova_team_members tm ON u.id = tm.user_id
    LEFT JOIN nova_teams t ON tm.team_id = t.id
    
    WHERE ' || where_clause || '
    
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
      ud.birthday,
      ud.full_name
    ORDER BY u.created_at DESC
    LIMIT $2
    OFFSET ($3 - 1) * $2
  ' USING search_query, page_size, page_number;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION count_search_users(
  search_query TEXT,
  role_filter TEXT DEFAULT NULL,
  enabled_filter BOOLEAN DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  total_count INTEGER;
  where_clause TEXT := '';
  query TEXT;
BEGIN
  -- Base where condition
  where_clause := 'u.display_name ILIKE ''%'' || $1 || ''%'' OR ud.email ILIKE ''%'' || $1 || ''%''';
  
  -- Add role filter if provided
  IF role_filter IS NOT NULL THEN
    CASE role_filter
      WHEN 'admin' THEN
        where_clause := where_clause || ' AND ur.allow_role_management = true';
      WHEN 'global_manager' THEN
        where_clause := where_clause || ' AND ur.allow_manage_all_challenges = true';
      WHEN 'challenge_manager' THEN
        where_clause := where_clause || ' AND ur.allow_challenge_management = true';
      WHEN 'member' THEN
        where_clause := where_clause || ' AND ur.allow_challenge_management = false AND ur.allow_manage_all_challenges = false AND ur.allow_role_management = false';
      ELSE
        -- No additional filter for 'all' or other values
    END CASE;
  END IF;
  
  -- Add enabled filter if provided
  IF enabled_filter IS NOT NULL THEN
    where_clause := where_clause || ' AND ur.enabled = ' || enabled_filter::TEXT;
  END IF;
  
  -- Construct and execute dynamic query
  query := '
    SELECT COUNT(DISTINCT u.id)
    FROM platform_user_roles ur
    JOIN users u ON ur.user_id = u.id
    JOIN user_private_details ud ON u.id = ud.user_id
    WHERE ' || where_clause;
  
  EXECUTE query INTO total_count USING search_query;
  
  RETURN total_count;
END;
$$ LANGUAGE plpgsql;