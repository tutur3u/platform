-- Migration: Create Tuna gamification tables for personal AI companion
-- This creates tables for the Tuna pet system including pet state, achievements,
-- accessories, memories, daily stats, and focus sessions

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tuna_mood') THEN
    CREATE TYPE public.tuna_mood AS ENUM ('happy', 'neutral', 'tired', 'sad', 'excited', 'focused');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tuna_achievement_category') THEN
    CREATE TYPE public.tuna_achievement_category AS ENUM ('productivity', 'social', 'milestones', 'special');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tuna_accessory_category') THEN
    CREATE TYPE public.tuna_accessory_category AS ENUM ('hat', 'glasses', 'background', 'decoration');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tuna_memory_category') THEN
    CREATE TYPE public.tuna_memory_category AS ENUM ('preference', 'fact', 'conversation_topic', 'event', 'person');
  END IF;
END $$;

-- ============================================================================
-- MAIN TABLES
-- ============================================================================

-- User's Tuna pet state (one per user)
CREATE TABLE IF NOT EXISTS public.tuna_pets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Tuna',
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  xp_to_next_level INTEGER NOT NULL DEFAULT 100,
  mood tuna_mood NOT NULL DEFAULT 'happy',
  health INTEGER NOT NULL DEFAULT 100 CHECK (health >= 0 AND health <= 100),
  hunger INTEGER NOT NULL DEFAULT 100 CHECK (hunger >= 0 AND hunger <= 100),
  last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_fed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_focus_minutes INTEGER NOT NULL DEFAULT 0,
  total_conversations INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Achievements catalog (global reference table)
CREATE TABLE IF NOT EXISTS public.tuna_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  xp_reward INTEGER NOT NULL DEFAULT 0,
  category tuna_achievement_category NOT NULL,
  unlock_condition JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User's unlocked achievements
CREATE TABLE IF NOT EXISTS public.tuna_user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.tuna_achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

-- Accessories catalog (global reference table)
CREATE TABLE IF NOT EXISTS public.tuna_accessories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category tuna_accessory_category NOT NULL,
  unlock_condition JSONB,
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User's owned and equipped accessories
CREATE TABLE IF NOT EXISTS public.tuna_user_accessories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  accessory_id UUID NOT NULL REFERENCES public.tuna_accessories(id) ON DELETE CASCADE,
  is_equipped BOOLEAN NOT NULL DEFAULT FALSE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, accessory_id)
);

-- Tuna's memory system for personalization
CREATE TABLE IF NOT EXISTS public.tuna_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category tuna_memory_category NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT,
  last_referenced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, category, key)
);

-- Daily stats for mood calculation and tracking
CREATE TABLE IF NOT EXISTS public.tuna_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  interactions INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  streak_day INTEGER NOT NULL DEFAULT 0,
  focus_minutes INTEGER NOT NULL DEFAULT 0,
  focus_sessions_completed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Focus sessions for deep work blocks
CREATE TABLE IF NOT EXISTS public.tuna_focus_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  planned_duration INTEGER NOT NULL CHECK (planned_duration > 0), -- minutes
  actual_duration INTEGER CHECK (actual_duration >= 0), -- minutes
  goal TEXT, -- what user wants to accomplish
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  notes TEXT, -- reflection after session
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tuna_pets_user_id ON public.tuna_pets(user_id);

CREATE INDEX IF NOT EXISTS idx_tuna_achievements_category ON public.tuna_achievements(category);
CREATE INDEX IF NOT EXISTS idx_tuna_achievements_code ON public.tuna_achievements(code);

CREATE INDEX IF NOT EXISTS idx_tuna_user_achievements_user_id ON public.tuna_user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_tuna_user_achievements_achievement_id ON public.tuna_user_achievements(achievement_id);

CREATE INDEX IF NOT EXISTS idx_tuna_accessories_category ON public.tuna_accessories(category);

CREATE INDEX IF NOT EXISTS idx_tuna_user_accessories_user_id ON public.tuna_user_accessories(user_id);
CREATE INDEX IF NOT EXISTS idx_tuna_user_accessories_equipped ON public.tuna_user_accessories(user_id) WHERE is_equipped = TRUE;

CREATE INDEX IF NOT EXISTS idx_tuna_memories_user_id ON public.tuna_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_tuna_memories_category ON public.tuna_memories(user_id, category);
CREATE INDEX IF NOT EXISTS idx_tuna_memories_key ON public.tuna_memories(user_id, key);

CREATE INDEX IF NOT EXISTS idx_tuna_daily_stats_user_date ON public.tuna_daily_stats(user_id, date);
CREATE INDEX IF NOT EXISTS idx_tuna_daily_stats_date ON public.tuna_daily_stats(date);

CREATE INDEX IF NOT EXISTS idx_tuna_focus_sessions_user_id ON public.tuna_focus_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_tuna_focus_sessions_started_at ON public.tuna_focus_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tuna_focus_sessions_active ON public.tuna_focus_sessions(user_id)
  WHERE ended_at IS NULL;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.tuna_pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tuna_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tuna_user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tuna_accessories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tuna_user_accessories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tuna_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tuna_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tuna_focus_sessions ENABLE ROW LEVEL SECURITY;

-- tuna_pets: Users can only access their own pet
CREATE POLICY "tuna_pets_select" ON public.tuna_pets
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "tuna_pets_insert" ON public.tuna_pets
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "tuna_pets_update" ON public.tuna_pets
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- tuna_achievements: Everyone can read achievements catalog
CREATE POLICY "tuna_achievements_select" ON public.tuna_achievements
  FOR SELECT TO authenticated USING (TRUE);

-- tuna_user_achievements: Users can only access their own unlocked achievements
CREATE POLICY "tuna_user_achievements_select" ON public.tuna_user_achievements
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "tuna_user_achievements_insert" ON public.tuna_user_achievements
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- tuna_accessories: Everyone can read accessories catalog
CREATE POLICY "tuna_accessories_select" ON public.tuna_accessories
  FOR SELECT TO authenticated USING (TRUE);

-- tuna_user_accessories: Users can only access their own accessories
CREATE POLICY "tuna_user_accessories_select" ON public.tuna_user_accessories
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "tuna_user_accessories_insert" ON public.tuna_user_accessories
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "tuna_user_accessories_update" ON public.tuna_user_accessories
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- tuna_memories: Users can only access their own memories
CREATE POLICY "tuna_memories_select" ON public.tuna_memories
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "tuna_memories_insert" ON public.tuna_memories
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "tuna_memories_update" ON public.tuna_memories
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "tuna_memories_delete" ON public.tuna_memories
  FOR DELETE USING (user_id = auth.uid());

-- tuna_daily_stats: Users can only access their own stats
CREATE POLICY "tuna_daily_stats_select" ON public.tuna_daily_stats
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "tuna_daily_stats_insert" ON public.tuna_daily_stats
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "tuna_daily_stats_update" ON public.tuna_daily_stats
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- tuna_focus_sessions: Users can only access their own sessions
CREATE POLICY "tuna_focus_sessions_select" ON public.tuna_focus_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "tuna_focus_sessions_insert" ON public.tuna_focus_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "tuna_focus_sessions_update" ON public.tuna_focus_sessions
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at for tuna_pets
CREATE TRIGGER update_tuna_pets_updated_at
  BEFORE UPDATE ON public.tuna_pets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-update updated_at for tuna_memories
CREATE TRIGGER update_tuna_memories_updated_at
  BEFORE UPDATE ON public.tuna_memories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-update updated_at for tuna_daily_stats
CREATE TRIGGER update_tuna_daily_stats_updated_at
  BEFORE UPDATE ON public.tuna_daily_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get or create a user's Tuna pet
CREATE OR REPLACE FUNCTION public.get_or_create_tuna_pet(p_user_id UUID)
RETURNS public.tuna_pets AS $$
DECLARE
  v_pet public.tuna_pets;
BEGIN
  -- Try to get existing pet
  SELECT * INTO v_pet FROM public.tuna_pets WHERE user_id = p_user_id;

  -- If no pet exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.tuna_pets (user_id)
    VALUES (p_user_id)
    RETURNING * INTO v_pet;
  END IF;

  RETURN v_pet;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to award XP and handle level ups
CREATE OR REPLACE FUNCTION public.award_tuna_xp(p_user_id UUID, p_xp INTEGER, p_source TEXT DEFAULT NULL)
RETURNS public.tuna_pets AS $$
DECLARE
  v_pet public.tuna_pets;
  v_new_xp INTEGER;
  v_new_level INTEGER;
  v_new_xp_to_next INTEGER;
BEGIN
  -- Get the pet (create if doesn't exist)
  SELECT * INTO v_pet FROM public.get_or_create_tuna_pet(p_user_id);

  -- Calculate new XP and level
  v_new_xp := v_pet.xp + p_xp;
  v_new_level := v_pet.level;
  v_new_xp_to_next := v_pet.xp_to_next_level;

  -- Handle level ups (exponential curve: each level needs 20% more XP)
  WHILE v_new_xp >= v_new_xp_to_next LOOP
    v_new_xp := v_new_xp - v_new_xp_to_next;
    v_new_level := v_new_level + 1;
    v_new_xp_to_next := CEIL(v_new_xp_to_next * 1.2);
  END LOOP;

  -- Update pet
  UPDATE public.tuna_pets
  SET
    xp = v_new_xp,
    level = v_new_level,
    xp_to_next_level = v_new_xp_to_next,
    last_interaction_at = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_pet;

  -- Update daily stats
  INSERT INTO public.tuna_daily_stats (user_id, date, xp_earned)
  VALUES (p_user_id, CURRENT_DATE, p_xp)
  ON CONFLICT (user_id, date)
  DO UPDATE SET
    xp_earned = tuna_daily_stats.xp_earned + p_xp,
    updated_at = NOW();

  RETURN v_pet;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record daily interaction and update streak
CREATE OR REPLACE FUNCTION public.record_tuna_interaction(p_user_id UUID)
RETURNS public.tuna_pets AS $$
DECLARE
  v_pet public.tuna_pets;
  v_last_date DATE;
  v_new_streak INTEGER;
BEGIN
  -- Get the pet
  SELECT * INTO v_pet FROM public.get_or_create_tuna_pet(p_user_id);

  -- Get the last interaction date
  SELECT date INTO v_last_date
  FROM public.tuna_daily_stats
  WHERE user_id = p_user_id
  ORDER BY date DESC
  LIMIT 1;

  -- Calculate streak
  IF v_last_date IS NULL THEN
    v_new_streak := 1;
  ELSIF v_last_date = CURRENT_DATE THEN
    v_new_streak := v_pet.streak_days; -- Same day, no change
  ELSIF v_last_date = CURRENT_DATE - INTERVAL '1 day' THEN
    v_new_streak := v_pet.streak_days + 1; -- Consecutive day
  ELSE
    v_new_streak := 1; -- Streak broken
  END IF;

  -- Update pet
  UPDATE public.tuna_pets
  SET
    streak_days = v_new_streak,
    total_conversations = total_conversations + 1,
    last_interaction_at = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_pet;

  -- Update daily stats
  INSERT INTO public.tuna_daily_stats (user_id, date, interactions, streak_day)
  VALUES (p_user_id, CURRENT_DATE, 1, v_new_streak)
  ON CONFLICT (user_id, date)
  DO UPDATE SET
    interactions = tuna_daily_stats.interactions + 1,
    streak_day = v_new_streak,
    updated_at = NOW();

  RETURN v_pet;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to complete a focus session
CREATE OR REPLACE FUNCTION public.complete_tuna_focus_session(
  p_session_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.tuna_focus_sessions AS $$
DECLARE
  v_session public.tuna_focus_sessions;
  v_actual_duration INTEGER;
  v_xp_earned INTEGER;
BEGIN
  -- Get the session
  SELECT * INTO v_session FROM public.tuna_focus_sessions WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Focus session not found';
  END IF;

  IF v_session.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'Focus session already completed';
  END IF;

  -- Calculate actual duration in minutes
  v_actual_duration := EXTRACT(EPOCH FROM (NOW() - v_session.started_at)) / 60;

  -- Calculate XP based on duration (1 XP per minute, bonus for completing planned duration)
  v_xp_earned := v_actual_duration;
  IF v_actual_duration >= v_session.planned_duration THEN
    -- Bonus XP for completing the full planned duration
    v_xp_earned := v_xp_earned + CEIL(v_session.planned_duration * 0.5);
  END IF;

  -- Update session
  UPDATE public.tuna_focus_sessions
  SET
    ended_at = NOW(),
    actual_duration = v_actual_duration,
    completed = v_actual_duration >= v_session.planned_duration,
    xp_earned = v_xp_earned,
    notes = COALESCE(p_notes, notes)
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  -- Award XP to pet
  PERFORM public.award_tuna_xp(v_session.user_id, v_xp_earned, 'focus_session');

  -- Update pet stats
  UPDATE public.tuna_pets
  SET
    total_focus_minutes = total_focus_minutes + v_actual_duration,
    updated_at = NOW()
  WHERE user_id = v_session.user_id;

  -- Update daily stats
  INSERT INTO public.tuna_daily_stats (user_id, date, focus_minutes, focus_sessions_completed)
  VALUES (
    v_session.user_id,
    CURRENT_DATE,
    v_actual_duration,
    CASE WHEN v_session.completed THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, date)
  DO UPDATE SET
    focus_minutes = tuna_daily_stats.focus_minutes + v_actual_duration,
    focus_sessions_completed = tuna_daily_stats.focus_sessions_completed +
      CASE WHEN v_session.completed THEN 1 ELSE 0 END,
    updated_at = NOW();

  RETURN v_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SEED INITIAL ACHIEVEMENTS
-- ============================================================================

INSERT INTO public.tuna_achievements (code, name, description, icon, xp_reward, category, sort_order) VALUES
  -- Milestones
  ('first_conversation', 'Hello, Tuna!', 'Have your first conversation with Tuna', 'MessageCircle', 10, 'milestones', 1),
  ('week_streak', 'Weekly Warrior', 'Maintain a 7-day interaction streak', 'Flame', 50, 'milestones', 2),
  ('month_streak', 'Monthly Master', 'Maintain a 30-day interaction streak', 'Trophy', 200, 'milestones', 3),
  ('level_5', 'Rising Star', 'Reach level 5 with Tuna', 'Star', 25, 'milestones', 4),
  ('level_10', 'Getting Serious', 'Reach level 10 with Tuna', 'Sparkles', 50, 'milestones', 5),
  ('level_25', 'True Companion', 'Reach level 25 with Tuna', 'Heart', 150, 'milestones', 6),

  -- Productivity
  ('first_focus', 'Deep Diver', 'Complete your first focus session', 'Timer', 15, 'productivity', 10),
  ('focus_10', 'Focus Champion', 'Complete 10 focus sessions', 'Target', 50, 'productivity', 11),
  ('focus_50', 'Focus Master', 'Complete 50 focus sessions', 'Zap', 150, 'productivity', 12),
  ('long_focus', 'Marathon Mind', 'Complete a 60-minute focus session', 'Clock', 30, 'productivity', 13),
  ('early_bird', 'Early Bird', 'Start a focus session before 7 AM', 'Sun', 20, 'productivity', 14),
  ('night_owl', 'Night Owl', 'Complete a focus session after 10 PM', 'Moon', 20, 'productivity', 15),
  ('total_focus_100', 'Century of Focus', 'Accumulate 100 minutes of focus time', 'Award', 40, 'productivity', 16),
  ('total_focus_1000', 'Focus Legend', 'Accumulate 1000 minutes of focus time', 'Crown', 200, 'productivity', 17),

  -- Social
  ('share_story', 'Open Book', 'Share a personal story with Tuna', 'Book', 15, 'social', 20),
  ('remember_me', 'Memory Lane', 'Have Tuna remember 10 things about you', 'Brain', 30, 'social', 21),
  ('deep_talk', 'Heart to Heart', 'Have a meaningful conversation with Tuna', 'HeartHandshake', 25, 'social', 22),

  -- Special
  ('fed_tuna', 'Good Provider', 'Feed Tuna for the first time', 'Cookie', 5, 'special', 30),
  ('fully_customized', 'Fashion Forward', 'Equip 3 different accessories', 'Palette', 30, 'special', 31),
  ('perfect_day', 'Perfect Day', 'Complete 3 focus sessions in one day', 'CalendarCheck', 40, 'special', 32)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- SEED INITIAL ACCESSORIES
-- ============================================================================

INSERT INTO public.tuna_accessories (code, name, description, category, unlock_condition, is_premium, sort_order) VALUES
  -- Hats
  ('party_hat', 'Party Hat', 'A festive party hat for celebrations', 'hat', '{"type": "level", "value": 1}', FALSE, 1),
  ('top_hat', 'Top Hat', 'A sophisticated top hat', 'hat', '{"type": "level", "value": 5}', FALSE, 2),
  ('crown', 'Royal Crown', 'A crown fit for royalty', 'hat', '{"type": "level", "value": 15}', FALSE, 3),
  ('graduation_cap', 'Graduation Cap', 'Celebrate your learning achievements', 'hat', '{"type": "achievement", "value": "focus_50"}', FALSE, 4),

  -- Glasses
  ('round_glasses', 'Round Glasses', 'Classic round spectacles', 'glasses', '{"type": "level", "value": 3}', FALSE, 10),
  ('sunglasses', 'Cool Shades', 'Looking cool under the sea', 'glasses', '{"type": "level", "value": 8}', FALSE, 11),
  ('star_glasses', 'Star Glasses', 'Be a star!', 'glasses', '{"type": "achievement", "value": "level_10"}', FALSE, 12),

  -- Backgrounds
  ('coral_reef', 'Coral Reef', 'A colorful coral reef background', 'background', '{"type": "level", "value": 1}', FALSE, 20),
  ('deep_sea', 'Deep Sea', 'Mysterious deep sea ambiance', 'background', '{"type": "level", "value": 10}', FALSE, 21),
  ('treasure_chest', 'Treasure Cove', 'Surrounded by treasure', 'background', '{"type": "level", "value": 20}', FALSE, 22),
  ('galaxy', 'Galaxy Fish Bowl', 'Swimming among the stars', 'background', '{"type": "achievement", "value": "month_streak"}', TRUE, 23),

  -- Decorations
  ('bubbles', 'Extra Bubbles', 'More bubbles in your tank', 'decoration', '{"type": "level", "value": 2}', FALSE, 30),
  ('seaweed', 'Dancing Seaweed', 'Graceful swaying seaweed', 'decoration', '{"type": "level", "value": 4}', FALSE, 31),
  ('treasure', 'Mini Treasure', 'A small treasure chest', 'decoration', '{"type": "level", "value": 7}', FALSE, 32),
  ('castle', 'Fish Castle', 'A tiny underwater castle', 'decoration', '{"type": "level", "value": 12}', FALSE, 33)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.tuna_pets IS 'User''s Tuna pet state - one pet per user for gamified AI companion';
COMMENT ON TABLE public.tuna_achievements IS 'Global catalog of achievements that users can unlock';
COMMENT ON TABLE public.tuna_user_achievements IS 'Junction table tracking which achievements each user has unlocked';
COMMENT ON TABLE public.tuna_accessories IS 'Global catalog of accessories for customizing Tuna';
COMMENT ON TABLE public.tuna_user_accessories IS 'Junction table tracking which accessories each user owns and has equipped';
COMMENT ON TABLE public.tuna_memories IS 'Tuna''s memory system for remembering facts about users';
COMMENT ON TABLE public.tuna_daily_stats IS 'Daily statistics for tracking user activity and calculating mood';
COMMENT ON TABLE public.tuna_focus_sessions IS 'Deep work focus sessions with Pomodoro-style timing';

COMMENT ON FUNCTION public.get_or_create_tuna_pet IS 'Gets or creates a Tuna pet for a user';
COMMENT ON FUNCTION public.award_tuna_xp IS 'Awards XP to a user''s Tuna pet with automatic level-up handling';
COMMENT ON FUNCTION public.record_tuna_interaction IS 'Records a daily interaction and updates streak';
COMMENT ON FUNCTION public.complete_tuna_focus_session IS 'Completes a focus session and awards XP';
