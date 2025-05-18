CREATE OR REPLACE FUNCTION count_search_users(search_query TEXT)
RETURNS INTEGER AS $$
DECLARE
  total_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT u.id) INTO total_count
  FROM platform_user_roles ur
  JOIN users u ON ur.user_id = u.id
  JOIN user_private_details ud ON u.id = ud.user_id
  WHERE 
    u.display_name ILIKE '%' || search_query || '%' OR
    ud.email ILIKE '%' || search_query || '%' 
    
  RETURN total_count;
END;
$$ LANGUAGE plpgsql;