'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MiraAchievement,
  MiraAchievementWithUnlock,
  MiraPet,
} from '../types/mira';
import { miraKeys } from './use-mira';

interface AchievementsResponse {
  achievements: MiraAchievementWithUnlock[];
  grouped: Record<string, MiraAchievementWithUnlock[]>;
  stats: {
    total: number;
    unlocked: number;
    total_xp_earned: number;
    completion_percentage: number;
  };
}

interface UnlockAchievementResponse {
  achievement: MiraAchievement;
  pet: MiraPet;
  already_unlocked: boolean;
  xp_earned?: number;
  message: string;
}

// Fetch achievements
async function fetchAchievements(): Promise<AchievementsResponse> {
  const res = await fetch('/api/v1/mira/achievements', {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error('Failed to fetch achievements');
  }
  return res.json();
}

// Unlock achievement
async function unlockAchievement(data: {
  achievement_code: string;
}): Promise<UnlockAchievementResponse> {
  const res = await fetch('/api/v1/mira/achievements/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error('Failed to unlock achievement');
  }
  return res.json();
}

/**
 * Hook for fetching achievements with unlock status
 */
export function useAchievements() {
  return useQuery({
    queryKey: miraKeys.achievements(),
    queryFn: fetchAchievements,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook for unlocking an achievement
 */
export function useUnlockAchievement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: unlockAchievement,
    onSuccess: (data) => {
      if (!data.already_unlocked) {
        // Invalidate achievements to refresh the list
        queryClient.invalidateQueries({ queryKey: miraKeys.achievements() });

        // Update pet data if XP was awarded
        if (data.pet) {
          queryClient.setQueryData(miraKeys.pet(), (old: unknown) => {
            if (old && typeof old === 'object' && 'pet' in old) {
              return {
                ...old,
                pet: data.pet,
              };
            }
            return old;
          });
        }
      }
    },
  });
}

/**
 * Check if a specific achievement is unlocked
 */
export function useIsAchievementUnlocked(achievementCode: string) {
  const { data } = useAchievements();

  if (!data) return false;

  const achievement = data.achievements.find((a) => a.code === achievementCode);
  return achievement?.is_unlocked ?? false;
}

/**
 * Get achievements grouped by category
 */
export function useGroupedAchievements() {
  const { data, ...rest } = useAchievements();

  return {
    ...rest,
    data: data?.grouped ?? {},
    stats: data?.stats,
  };
}
