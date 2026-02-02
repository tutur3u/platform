// Tuna Pet Types for Gamified AI Companion Feature

// ============================================================================
// Enum Types (matching database enums)
// ============================================================================

export type TunaMood =
  | 'happy'
  | 'neutral'
  | 'tired'
  | 'sad'
  | 'excited'
  | 'focused';

export type TunaAchievementCategory =
  | 'productivity'
  | 'social'
  | 'milestones'
  | 'special';

export type TunaAccessoryCategory =
  | 'hat'
  | 'glasses'
  | 'background'
  | 'decoration';

export type TunaMemoryCategory =
  | 'preference'
  | 'fact'
  | 'conversation_topic'
  | 'event'
  | 'person';

// ============================================================================
// Core Data Types
// ============================================================================

export interface TunaPet {
  id: string;
  user_id: string;
  name: string;
  level: number;
  xp: number;
  xp_to_next_level: number;
  mood: TunaMood;
  health: number;
  hunger: number;
  last_interaction_at: string;
  last_fed_at: string;
  total_focus_minutes: number;
  total_conversations: number;
  streak_days: number;
  created_at: string;
  updated_at: string;
}

export interface TunaAchievement {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  xp_reward: number;
  category: TunaAchievementCategory;
  unlock_condition: Record<string, unknown> | null;
  sort_order: number;
  created_at: string;
}

export interface TunaUserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
}

export interface TunaAchievementWithUnlock extends TunaAchievement {
  unlocked_at: string | null;
  is_unlocked: boolean;
}

export interface TunaAccessory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: TunaAccessoryCategory;
  unlock_condition: Record<string, unknown> | null;
  is_premium: boolean;
  sort_order: number;
  created_at: string;
}

export interface TunaUserAccessory {
  id: string;
  user_id: string;
  accessory_id: string;
  is_equipped: boolean;
  unlocked_at: string;
}

export interface TunaAccessoryWithOwnership extends TunaAccessory {
  is_owned: boolean;
  is_equipped: boolean;
  unlocked_at: string | null;
}

export interface TunaMemory {
  id: string;
  user_id: string;
  category: TunaMemoryCategory;
  key: string;
  value: string;
  confidence: number;
  source: string | null;
  last_referenced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TunaDailyStats {
  id: string;
  user_id: string;
  date: string;
  tasks_completed: number;
  interactions: number;
  xp_earned: number;
  streak_day: number;
  focus_minutes: number;
  focus_sessions_completed: number;
  created_at: string;
  updated_at: string;
}

export interface TunaFocusSession {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  planned_duration: number; // minutes
  actual_duration: number | null; // minutes
  goal: string | null;
  completed: boolean;
  xp_earned: number;
  notes: string | null;
  created_at: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface TunaPetResponse {
  pet: TunaPet;
  equipped_accessories: TunaAccessoryWithOwnership[];
}

export interface UpdateTunaPetRequest {
  name?: string;
  mood?: TunaMood;
}

export interface FeedTunaRequest {
  food_type?: 'regular' | 'premium';
}

export interface FeedTunaResponse {
  pet: TunaPet;
  xp_earned: number;
  message: string;
}

export interface AwardXpRequest {
  amount: number;
  source?: string;
}

export interface AwardXpResponse {
  pet: TunaPet;
  leveled_up: boolean;
  new_level?: number;
}

export interface StartFocusSessionRequest {
  planned_duration: number; // minutes (25, 45, 60)
  goal?: string;
}

export interface StartFocusSessionResponse {
  session: TunaFocusSession;
}

export interface CompleteFocusSessionRequest {
  session_id: string;
  notes?: string;
}

export interface CompleteFocusSessionResponse {
  session: TunaFocusSession;
  pet: TunaPet;
  xp_earned: number;
  achievements_unlocked: TunaAchievement[];
}

export interface TunaMemoryRequest {
  category: TunaMemoryCategory;
  key: string;
  value: string;
  source?: string;
  confidence?: number;
}

export interface SearchMemoriesRequest {
  query: string;
  category?: TunaMemoryCategory;
  limit?: number;
}

export interface UnlockAchievementRequest {
  achievement_code: string;
}

export interface UnlockAchievementResponse {
  achievement: TunaAchievement;
  pet: TunaPet;
  already_unlocked: boolean;
}

// ============================================================================
// UI State Types
// ============================================================================

export type TunaAnimationState =
  | 'idle'
  | 'happy'
  | 'sad'
  | 'listening'
  | 'speaking'
  | 'celebrating'
  | 'sleeping'
  | 'eating'
  | 'focused';

export interface TunaUIState {
  animation_state: TunaAnimationState;
  is_speaking: boolean;
  speech_text: string | null;
  show_celebration: boolean;
}

export interface FocusTimerState {
  is_active: boolean;
  session: TunaFocusSession | null;
  elapsed_seconds: number;
  remaining_seconds: number;
}

// ============================================================================
// Focus Session Presets
// ============================================================================

export const FOCUS_DURATION_PRESETS = [
  { value: 25, label: '25 min', description: 'Pomodoro' },
  { value: 45, label: '45 min', description: 'Extended' },
  { value: 60, label: '60 min', description: 'Deep work' },
] as const;

export type FocusDurationPreset = (typeof FOCUS_DURATION_PRESETS)[number];

// ============================================================================
// Mood Calculation
// ============================================================================

export interface MoodFactors {
  streak_days: number;
  daily_interactions: number;
  daily_focus_minutes: number;
  hunger: number;
  health: number;
  hours_since_last_interaction: number;
}

export function calculateMood(factors: MoodFactors): TunaMood {
  const {
    streak_days,
    daily_interactions,
    daily_focus_minutes,
    hunger,
    health,
    hours_since_last_interaction,
  } = factors;

  // Low health or hunger = sad
  if (health < 30 || hunger < 30) {
    return 'sad';
  }

  // Long time without interaction = tired
  if (hours_since_last_interaction > 24) {
    return 'tired';
  }

  // Currently in focus mode
  if (daily_focus_minutes > 0 && hours_since_last_interaction < 1) {
    return 'focused';
  }

  // Great streak or lots of activity = excited
  if (
    streak_days >= 7 ||
    (daily_interactions >= 5 && daily_focus_minutes >= 45)
  ) {
    return 'excited';
  }

  // Good engagement = happy
  if (daily_interactions >= 1 || streak_days >= 3) {
    return 'happy';
  }

  return 'neutral';
}

// ============================================================================
// XP Calculation Helpers
// ============================================================================

export function calculateXpForLevel(level: number): number {
  // Exponential curve: each level needs 20% more XP
  // Level 1 -> 100, Level 2 -> 120, Level 3 -> 144, etc.
  return Math.ceil(100 * 1.2 ** (level - 1));
}

export function calculateFocusSessionXp(
  plannedDuration: number,
  actualDuration: number
): number {
  // Base XP: 1 per minute
  let xp = actualDuration;

  // Bonus for completing planned duration
  if (actualDuration >= plannedDuration) {
    xp += Math.ceil(plannedDuration * 0.5);
  }

  return xp;
}

// ============================================================================
// Achievement Checking
// ============================================================================

export interface AchievementCheckContext {
  pet: TunaPet;
  daily_stats: TunaDailyStats | null;
  total_focus_sessions: number;
  memories_count: number;
}

export function checkAchievementUnlock(
  achievement_code: string,
  context: AchievementCheckContext
): boolean {
  const { pet, daily_stats, total_focus_sessions, memories_count } = context;

  switch (achievement_code) {
    case 'first_conversation':
      return pet.total_conversations >= 1;
    case 'week_streak':
      return pet.streak_days >= 7;
    case 'month_streak':
      return pet.streak_days >= 30;
    case 'level_5':
      return pet.level >= 5;
    case 'level_10':
      return pet.level >= 10;
    case 'level_25':
      return pet.level >= 25;
    case 'first_focus':
      return total_focus_sessions >= 1;
    case 'focus_10':
      return total_focus_sessions >= 10;
    case 'focus_50':
      return total_focus_sessions >= 50;
    case 'total_focus_100':
      return pet.total_focus_minutes >= 100;
    case 'total_focus_1000':
      return pet.total_focus_minutes >= 1000;
    case 'remember_me':
      return memories_count >= 10;
    case 'fed_tuna':
      return pet.hunger < 100; // Has been fed at some point
    case 'perfect_day':
      return (daily_stats?.focus_sessions_completed ?? 0) >= 3;
    default:
      return false;
  }
}

// ============================================================================
// Task Types for Tuna Panel
// ============================================================================

export interface TunaTask {
  id: string;
  name: string;
  description?: string | null;
  priority: string;
  end_date?: string | null;
  list_id?: string | null;
  list_name?: string | null;
  board_id?: string | null;
  board_name?: string | null;
  ws_id?: string | null;
}

export interface TunaTasksResponse {
  overdue: TunaTask[];
  today: TunaTask[];
  upcoming: TunaTask[];
  stats: {
    total: number;
    completed_today: number;
  };
}

export interface CompleteTaskRequest {
  task_id: string;
}

export interface CompleteTaskResponse {
  task: TunaTask;
  pet: TunaPet;
  xp_earned: number;
  leveled_up: boolean;
  new_level?: number;
}

// ============================================================================
// Task XP Calculation
// ============================================================================

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';

const PRIORITY_MULTIPLIERS: Record<TaskPriority, number> = {
  critical: 2.0,
  high: 1.5,
  normal: 1.0,
  low: 0.75,
};

const BASE_TASK_XP = 10;
const OVERDUE_BONUS_XP = 5;

export function calculateTaskXp(
  priority: TaskPriority | string,
  isOverdue: boolean
): number {
  const multiplier =
    PRIORITY_MULTIPLIERS[priority as TaskPriority] ??
    PRIORITY_MULTIPLIERS.normal;
  let xp = Math.ceil(BASE_TASK_XP * multiplier);

  if (isOverdue) {
    xp += OVERDUE_BONUS_XP;
  }

  return xp;
}

// ============================================================================
// Calendar Types for Tuna Panel
// ============================================================================

export interface TunaCalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  start_at: string;
  end_at: string;
  color?: string | null;
  location?: string | null;
}

export interface TunaCalendarResponse {
  events: TunaCalendarEvent[];
  stats: {
    total: number;
    encrypted_count: number;
  };
}
