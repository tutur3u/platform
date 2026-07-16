// DB orchestration for task-progress gamification. Idempotent: XP is recomputed
// deterministically from the current context on every sync, so calling it after
// any progress write (or on a gamification read) never double-counts.

import {
  ACHIEVEMENT_CATALOG,
  type AchievementTier,
  achievementXp,
  type GamificationContext,
  levelForXp,
  metAchievementCodes,
} from './_gamification';
import { TASK_PROGRESS_ENTRY_SELECT } from './_schemas';
import { withEffectiveProgressValues } from './_utils';

type AdminClient = any;

const DAY_MS = 86_400_000;

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function computeLongestStreak(activeDates: Set<string>): number {
  const dates = [...activeDates].sort();
  let longest = 0;
  let current = 0;
  let previous: string | null = null;
  for (const date of dates) {
    const expected = previous
      ? formatDate(
          new Date(new Date(`${previous}T00:00:00.000Z`).getTime() + DAY_MS)
        )
      : null;
    current = expected === date ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = date;
  }
  return longest;
}

function computeCurrentStreak(activeDates: Set<string>): number {
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    if (!activeDates.has(formatDate(cursor))) return streak;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
}

/** Seed the achievement catalog for a workspace if it has none yet. */
export async function ensureAchievementCatalog(
  sbAdmin: AdminClient,
  wsId: string
): Promise<void> {
  const { data, error } = await sbAdmin
    .from('task_progress_achievements')
    .select('id')
    .eq('ws_id', wsId)
    .limit(1);
  if (error) throw error;
  if (data && data.length > 0) return;

  const rows = ACHIEVEMENT_CATALOG.map((achievement) => ({
    ws_id: wsId,
    code: achievement.code,
    name: achievement.name,
    description: achievement.description,
    icon: achievement.icon,
    tier: achievement.tier,
    category: achievement.category,
    criteria: achievement.criteria,
    sort_order: achievement.sort_order,
  }));
  const { error: insertError } = await sbAdmin
    .from('task_progress_achievements')
    .upsert(rows, { onConflict: 'ws_id,code', ignoreDuplicates: true });
  if (insertError) throw insertError;
}

/** Build the cross-metric gamification context for a user in a workspace. */
export async function getGamificationContext(
  sbAdmin: AdminClient,
  wsId: string,
  userId: string
): Promise<GamificationContext> {
  const { data: entries, error } = await sbAdmin
    .from('task_progress_entries')
    .select(TASK_PROGRESS_ENTRY_SELECT)
    .eq('ws_id', wsId)
    .eq('created_by', userId)
    .is('deleted_at', null)
    .limit(20000);
  if (error) throw error;

  const effective = withEffectiveProgressValues(entries ?? []);
  const byDate = new Map<string, number>();
  let totalValue = 0;
  for (const entry of effective as Array<Record<string, any>>) {
    const value = Number(entry.effectiveValue ?? 0);
    totalValue += value;
    if (entry.entry_date) {
      byDate.set(entry.entry_date, (byDate.get(entry.entry_date) ?? 0) + value);
    }
  }
  const activeDates = new Set(
    [...byDate.entries()].filter(([, value]) => value > 0).map(([date]) => date)
  );

  const { count: goalsCompleted } = await sbAdmin
    .from('task_progress_goals')
    .select('id', { count: 'exact', head: true })
    .eq('ws_id', wsId)
    .eq('owner_id', userId)
    .eq('status', 'completed');

  const { count: leaderboardsJoined } = await sbAdmin
    .from('task_leaderboard_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'active');

  return {
    entriesCount: (entries ?? []).length,
    currentStreak: computeCurrentStreak(activeDates),
    longestStreak: computeLongestStreak(activeDates),
    activeDays: activeDates.size,
    totalValue,
    goalsCompleted: Number(goalsCompleted ?? 0),
    leaderboardsJoined: Number(leaderboardsJoined ?? 0),
  };
}

export interface GamificationSyncResult {
  xp: number;
  level: number;
  streakFreezes: number;
  unlocked: string[];
  newlyUnlocked: string[];
  context: GamificationContext;
}

/**
 * Recompute unlocks + XP + level for a user and persist. Deterministic and
 * idempotent. Returns the resulting stats plus any newly unlocked codes (for
 * celebration toasts).
 */
export async function syncTaskProgressGamification(
  sbAdmin: AdminClient,
  wsId: string,
  userId: string
): Promise<GamificationSyncResult> {
  await ensureAchievementCatalog(sbAdmin, wsId);
  const context = await getGamificationContext(sbAdmin, wsId, userId);

  const { data: catalog, error: catalogError } = await sbAdmin
    .from('task_progress_achievements')
    .select('code, tier, criteria')
    .eq('ws_id', wsId);
  if (catalogError) throw catalogError;

  const tierByCode = new Map<string, AchievementTier>(
    (catalog ?? []).map((row: any) => [row.code, row.tier as AchievementTier])
  );
  const metCodes = metAchievementCodes(catalog ?? [], context);

  const { data: existing, error: existingError } = await sbAdmin
    .from('task_progress_user_achievements')
    .select('achievement_code')
    .eq('ws_id', wsId)
    .eq('user_id', userId);
  if (existingError) throw existingError;
  const existingCodes = new Set(
    (existing ?? []).map((row: any) => row.achievement_code)
  );

  const newlyUnlocked = metCodes.filter((code) => !existingCodes.has(code));
  if (newlyUnlocked.length > 0) {
    const rows = newlyUnlocked.map((code) => ({
      ws_id: wsId,
      user_id: userId,
      achievement_code: code,
      unlocked_at: new Date().toISOString(),
      progress: 1,
    }));
    const { error: unlockError } = await sbAdmin
      .from('task_progress_user_achievements')
      .upsert(rows, {
        onConflict: 'ws_id,user_id,achievement_code',
        ignoreDuplicates: true,
      });
    if (unlockError) throw unlockError;
  }

  // Deterministic XP: achievement rewards + activity volume. Recomputed every
  // sync so it never drifts or double-counts.
  const achievementXpTotal = metCodes.reduce(
    (sum, code) => sum + achievementXp(tierByCode.get(code) ?? 'bronze'),
    0
  );
  const activityXp =
    context.entriesCount * 5 +
    context.activeDays * 10 +
    Math.floor(context.totalValue / 50);
  const xp = achievementXpTotal + activityXp;
  const level = levelForXp(xp);
  const streakFreezes = Math.min(3, Math.floor(context.longestStreak / 7));

  const { error: statsError } = await sbAdmin
    .from('task_progress_user_stats')
    .upsert(
      {
        ws_id: wsId,
        user_id: userId,
        xp,
        level,
        streak_freezes: streakFreezes,
        last_milestone_at:
          newlyUnlocked.length > 0 ? new Date().toISOString() : undefined,
      },
      { onConflict: 'ws_id,user_id' }
    );
  if (statsError) throw statsError;

  return {
    xp,
    level,
    streakFreezes,
    unlocked: metCodes,
    newlyUnlocked,
    context,
  };
}
