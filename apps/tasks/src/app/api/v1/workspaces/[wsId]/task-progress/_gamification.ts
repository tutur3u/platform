// Task progress gamification: XP curve, level math, and achievement criteria.
// The pure functions here are unit-tested; DB orchestration lives lower down.

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';
export type AchievementCategory =
  | 'streak'
  | 'volume'
  | 'consistency'
  | 'milestone'
  | 'social';

export interface AchievementDefinition {
  code: string;
  name: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  category: AchievementCategory;
  criteria: AchievementCriteria;
  sort_order: number;
}

export type AchievementCriteria =
  | { type: 'entries'; value: number }
  | { type: 'streak'; value: number }
  | { type: 'active_days'; value: number }
  | { type: 'total'; value: number }
  | { type: 'goal_completed'; value: number }
  | { type: 'leaderboard_joined'; value: number };

export interface GamificationContext {
  entriesCount: number;
  currentStreak: number;
  longestStreak: number;
  activeDays: number;
  totalValue: number;
  goalsCompleted: number;
  leaderboardsJoined: number;
}

/**
 * Starter catalog. Kept in sync with the seed in
 * 20260716173718_task_progress_upgrade.sql so runtime seeding of new
 * workspaces matches migrated ones.
 */
export const ACHIEVEMENT_CATALOG: AchievementDefinition[] = [
  {
    code: 'first_entry',
    name: 'First steps',
    description: 'Log your first progress entry.',
    icon: 'Sparkles',
    tier: 'bronze',
    category: 'milestone',
    criteria: { type: 'entries', value: 1 },
    sort_order: 10,
  },
  {
    code: 'streak_3',
    name: 'Warming up',
    description: 'Reach a 3-day activity streak.',
    icon: 'Flame',
    tier: 'bronze',
    category: 'streak',
    criteria: { type: 'streak', value: 3 },
    sort_order: 20,
  },
  {
    code: 'streak_7',
    name: 'On a roll',
    description: 'Reach a 7-day activity streak.',
    icon: 'Flame',
    tier: 'silver',
    category: 'streak',
    criteria: { type: 'streak', value: 7 },
    sort_order: 30,
  },
  {
    code: 'streak_30',
    name: 'Unstoppable',
    description: 'Reach a 30-day activity streak.',
    icon: 'Flame',
    tier: 'gold',
    category: 'streak',
    criteria: { type: 'streak', value: 30 },
    sort_order: 40,
  },
  {
    code: 'streak_100',
    name: 'Centurion',
    description: 'Reach a 100-day activity streak.',
    icon: 'Trophy',
    tier: 'platinum',
    category: 'streak',
    criteria: { type: 'streak', value: 100 },
    sort_order: 50,
  },
  {
    code: 'active_10',
    name: 'Habit forming',
    description: 'Be active on 10 different days.',
    icon: 'CalendarCheck',
    tier: 'bronze',
    category: 'consistency',
    criteria: { type: 'active_days', value: 10 },
    sort_order: 60,
  },
  {
    code: 'active_50',
    name: 'Dependable',
    description: 'Be active on 50 different days.',
    icon: 'CalendarCheck',
    tier: 'silver',
    category: 'consistency',
    criteria: { type: 'active_days', value: 50 },
    sort_order: 70,
  },
  {
    code: 'goal_complete',
    name: 'Goal getter',
    description: 'Complete a target goal.',
    icon: 'Target',
    tier: 'silver',
    category: 'milestone',
    criteria: { type: 'goal_completed', value: 1 },
    sort_order: 80,
  },
  {
    code: 'volume_1k',
    name: 'Getting going',
    description: 'Accumulate 1,000 units of any metric.',
    icon: 'TrendingUp',
    tier: 'bronze',
    category: 'volume',
    criteria: { type: 'total', value: 1000 },
    sort_order: 90,
  },
  {
    code: 'volume_10k',
    name: 'Prolific',
    description: 'Accumulate 10,000 units of any metric.',
    icon: 'TrendingUp',
    tier: 'silver',
    category: 'volume',
    criteria: { type: 'total', value: 10000 },
    sort_order: 100,
  },
  {
    code: 'volume_50k',
    name: 'Powerhouse',
    description: 'Accumulate 50,000 units of any metric.',
    icon: 'Award',
    tier: 'gold',
    category: 'volume',
    criteria: { type: 'total', value: 50000 },
    sort_order: 110,
  },
  {
    code: 'leaderboard_join',
    name: 'Team player',
    description: 'Join a leaderboard challenge.',
    icon: 'Users',
    tier: 'bronze',
    category: 'social',
    criteria: { type: 'leaderboard_joined', value: 1 },
    sort_order: 120,
  },
];

const TIER_XP: Record<AchievementTier, number> = {
  bronze: 50,
  silver: 100,
  gold: 250,
  platinum: 500,
};

/** XP granted when an achievement of the given tier is unlocked. */
export function achievementXp(tier: AchievementTier): number {
  return TIER_XP[tier] ?? 50;
}

/** Cumulative XP required to reach a given level (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return 50 * (l - 1) * (l - 1);
}

/** Level for a given XP total (inverse of xpForLevel). */
export function levelForXp(xp: number): number {
  if (xp <= 0) return 1;
  return Math.floor(Math.sqrt(xp / 50)) + 1;
}

/** Progress details toward the next level, for UI progress bars. */
export function levelProgress(xp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  intoLevel: number;
  span: number;
  percent: number;
} {
  const level = levelForXp(xp);
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const span = Math.max(1, nextLevelXp - currentLevelXp);
  const intoLevel = Math.max(0, xp - currentLevelXp);
  return {
    level,
    currentLevelXp,
    nextLevelXp,
    intoLevel,
    span,
    percent: Math.min(100, Math.round((intoLevel / span) * 100)),
  };
}

/** Whether a single achievement's criteria are satisfied by the context. */
export function isAchievementMet(
  criteria: AchievementCriteria,
  context: GamificationContext
): boolean {
  switch (criteria.type) {
    case 'entries':
      return context.entriesCount >= criteria.value;
    case 'streak':
      return context.longestStreak >= criteria.value;
    case 'active_days':
      return context.activeDays >= criteria.value;
    case 'total':
      return context.totalValue >= criteria.value;
    case 'goal_completed':
      return context.goalsCompleted >= criteria.value;
    case 'leaderboard_joined':
      return context.leaderboardsJoined >= criteria.value;
    default:
      return false;
  }
}

/** Codes from the catalog whose criteria are met by the context. */
export function metAchievementCodes(
  catalog: Array<{ code: string; criteria: AchievementCriteria }>,
  context: GamificationContext
): string[] {
  return catalog
    .filter((achievement) => isAchievementMet(achievement.criteria, context))
    .map((achievement) => achievement.code);
}
