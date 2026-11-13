'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MiraDailyStats, MiraPet } from '../types/mira';

interface MiraPetResponse {
  pet: MiraPet;
  equipped_accessories: unknown[];
  daily_stats: MiraDailyStats | null;
}

interface FeedResponse {
  pet: MiraPet;
  xp_earned: number;
  message: string;
}

interface AwardXpResponse {
  pet: MiraPet;
  leveled_up: boolean;
  new_level?: number;
}

// Query keys for cache management
export const miraKeys = {
  all: ['mira'] as const,
  pet: () => [...miraKeys.all, 'pet'] as const,
  achievements: () => [...miraKeys.all, 'achievements'] as const,
  memories: (category?: string) =>
    [...miraKeys.all, 'memories', category] as const,
  focus: () => [...miraKeys.all, 'focus'] as const,
  focusHistory: (limit?: number) =>
    [...miraKeys.all, 'focus', 'history', limit] as const,
};

// Fetch pet data
async function fetchMiraPet(): Promise<MiraPetResponse> {
  const res = await fetch('/api/v1/mira/pet', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Failed to fetch pet');
  }
  return res.json();
}

// Update pet
async function updateMiraPet(data: {
  name?: string;
}): Promise<{ pet: MiraPet }> {
  const res = await fetch('/api/v1/mira/pet', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error('Failed to update pet');
  }
  return res.json();
}

// Feed pet
async function feedMira(): Promise<FeedResponse> {
  const res = await fetch('/api/v1/mira/pet/feed', {
    method: 'POST',
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to feed pet');
  }
  return res.json();
}

// Award XP
async function awardXp(data: {
  amount: number;
  source?: string;
}): Promise<AwardXpResponse> {
  const res = await fetch('/api/v1/mira/xp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error('Failed to award XP');
  }
  return res.json();
}

/**
 * Hook for fetching and managing Mira pet data
 */
export function useMira() {
  return useQuery({
    queryKey: miraKeys.pet(),
    queryFn: fetchMiraPet,
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook for updating Mira pet (name, etc.)
 */
export function useUpdateMira() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateMiraPet,
    onSuccess: (data) => {
      // Update pet in cache
      queryClient.setQueryData(
        miraKeys.pet(),
        (old: MiraPetResponse | undefined) => ({
          ...old,
          pet: data.pet,
        })
      );
    },
  });
}

/**
 * Hook for feeding Mira
 */
export function useFeedMira() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: feedMira,
    onSuccess: (data) => {
      // Update pet in cache with optimistic update
      queryClient.setQueryData(
        miraKeys.pet(),
        (old: MiraPetResponse | undefined) => ({
          ...old,
          pet: data.pet,
        })
      );
    },
  });
}

/**
 * Hook for awarding XP to Mira
 */
export function useAwardXp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: awardXp,
    onSuccess: (data) => {
      // Update pet in cache
      queryClient.setQueryData(
        miraKeys.pet(),
        (old: MiraPetResponse | undefined) => ({
          ...old,
          pet: data.pet,
        })
      );
    },
  });
}

/**
 * Hook for invalidating all mira-related queries
 */
export function useInvalidateMira() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: miraKeys.all });
  };
}
