import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_CATALOG,
  achievementXp,
  type GamificationContext,
  isAchievementMet,
  levelForXp,
  levelProgress,
  metAchievementCodes,
  xpForLevel,
} from './_gamification';

const baseContext: GamificationContext = {
  entriesCount: 0,
  currentStreak: 0,
  longestStreak: 0,
  activeDays: 0,
  totalValue: 0,
  goalsCompleted: 0,
  leaderboardsJoined: 0,
};

describe('xp / level curve', () => {
  it('is monotonic and self-inverse at boundaries', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(xpForLevel(2))).toBe(2);
    expect(levelForXp(xpForLevel(5))).toBe(5);
    expect(levelForXp(xpForLevel(10))).toBe(10);
  });

  it('stays within a level until the next threshold', () => {
    const l2 = xpForLevel(2);
    const l3 = xpForLevel(3);
    expect(levelForXp(l2)).toBe(2);
    expect(levelForXp(l3 - 1)).toBe(2);
    expect(levelForXp(l3)).toBe(3);
  });

  it('reports level progress toward the next level', () => {
    const progress = levelProgress(xpForLevel(2));
    expect(progress.level).toBe(2);
    expect(progress.intoLevel).toBe(0);
    expect(progress.percent).toBe(0);
    const mid = levelProgress(
      xpForLevel(2) + (xpForLevel(3) - xpForLevel(2)) / 2
    );
    expect(mid.percent).toBe(50);
  });

  it('grants tiered XP', () => {
    expect(achievementXp('bronze')).toBeLessThan(achievementXp('silver'));
    expect(achievementXp('silver')).toBeLessThan(achievementXp('gold'));
    expect(achievementXp('gold')).toBeLessThan(achievementXp('platinum'));
  });
});

describe('achievement criteria', () => {
  it('uses longest streak (not current) for streak achievements', () => {
    expect(
      isAchievementMet(
        { type: 'streak', value: 7 },
        {
          ...baseContext,
          currentStreak: 2,
          longestStreak: 8,
        }
      )
    ).toBe(true);
    expect(
      isAchievementMet(
        { type: 'streak', value: 7 },
        {
          ...baseContext,
          longestStreak: 6,
        }
      )
    ).toBe(false);
  });

  it('evaluates volume, entries, active days, goals, and social', () => {
    const context: GamificationContext = {
      ...baseContext,
      entriesCount: 5,
      activeDays: 12,
      totalValue: 1500,
      goalsCompleted: 1,
      leaderboardsJoined: 1,
    };
    const codes = metAchievementCodes(ACHIEVEMENT_CATALOG, context);
    expect(codes).toEqual(
      expect.arrayContaining([
        'first_entry',
        'active_10',
        'volume_1k',
        'goal_complete',
        'leaderboard_join',
      ])
    );
    expect(codes).not.toContain('volume_10k');
    expect(codes).not.toContain('streak_7');
  });

  it('unlocks nothing for an empty context', () => {
    expect(metAchievementCodes(ACHIEVEMENT_CATALOG, baseContext)).toEqual([]);
  });
});
