-- Fix the ambiguous column reference in the user challenge statistics functions

-- Update Function to get the total number of sessions for a user in a specific challenge
CREATE OR REPLACE FUNCTION nova_get_user_total_sessions(
  challenge_id UUID,
  user_id UUID
) RETURNS INTEGER AS $$
DECLARE
  total_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO total_count
  FROM nova_sessions
  WHERE nova_sessions.challenge_id = $1
    AND nova_sessions.user_id = $2;
  
  RETURN total_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update Function to get the number of sessions a user has completed today for a specific challenge
CREATE OR REPLACE FUNCTION nova_get_user_daily_sessions(
  challenge_id UUID,
  user_id UUID
) RETURNS INTEGER AS $$
DECLARE
  daily_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO daily_count
  FROM nova_sessions
  WHERE nova_sessions.challenge_id = $1
    AND nova_sessions.user_id = $2
    AND DATE(nova_sessions.start_time) = CURRENT_DATE;
  
  RETURN daily_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update stored procedure to retrieve challenge info with user stats
CREATE OR REPLACE FUNCTION nova_get_challenge_with_user_stats(
  challenge_id UUID,
  user_id UUID
) RETURNS jsonb AS $$
DECLARE
  challenge_info jsonb;
  total_sessions INTEGER;
  daily_sessions INTEGER;
  last_session jsonb;
BEGIN
  -- Get the challenge information
  SELECT to_jsonb(c) INTO challenge_info
  FROM nova_challenges c
  WHERE c.id = $1;
  
  -- If challenge doesn't exist, return null
  IF challenge_info IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get user's total sessions for this challenge
  total_sessions := nova_get_user_total_sessions($1, $2);
  
  -- Get user's daily sessions for this challenge
  daily_sessions := nova_get_user_daily_sessions($1, $2);
  
  -- Get user's last session for this challenge
  SELECT to_jsonb(s)
  INTO last_session
  FROM nova_sessions s
  WHERE s.challenge_id = $1
    AND s.user_id = $2
  ORDER BY s.start_time DESC
  LIMIT 1;
  
  -- Add stats to the challenge info
  challenge_info := challenge_info || jsonb_build_object(
    'total_sessions', total_sessions,
    'daily_sessions', daily_sessions,
    'lastSession', last_session
  );
  
  RETURN challenge_info;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update function to get all challenges with user stats
CREATE OR REPLACE FUNCTION nova_get_all_challenges_with_user_stats(
  user_id UUID
) RETURNS jsonb AS $$
DECLARE
  all_challenges jsonb;
  challenge_rec RECORD;
  challenges_array jsonb := '[]'::jsonb;
BEGIN
  -- Iterate through all challenges
  FOR challenge_rec IN 
    SELECT nova_challenges.id FROM nova_challenges
  LOOP
    -- Get challenge with user stats
    all_challenges := nova_get_challenge_with_user_stats(challenge_rec.id, $1);
    
    -- Add to array if not null
    IF all_challenges IS NOT NULL THEN
      challenges_array := challenges_array || all_challenges;
    END IF;
  END LOOP;
  
  RETURN challenges_array;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
