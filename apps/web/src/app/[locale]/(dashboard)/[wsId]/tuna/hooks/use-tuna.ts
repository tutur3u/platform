'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TunaDailyStats, TunaPet } from '../types/tuna';

interface TunaPetResponse {
  pet: TunaPet;
  equipped_accessories: unknown[];
  daily_stats: TunaDailyStats | null;
}

interface FeedResponse {
  pet: TunaPet;
  xp_earned: number;
  message: string;
}

interface AwardXpResponse {
  pet: TunaPet;
  leveled_up: boolean;
  new_level?: number;
}

// Query keys for cache management
export const tunaKeys = {
  all: ['tuna'] as const,
  pet: () => [...tunaKeys.all, 'pet'] as const,
  achievements: () => [...tunaKeys.all, 'achievements'] as const,
  memories: (category?: string) =>
    [...tunaKeys.all, 'memories', category] as const,
  focus: () => [...tunaKeys.all, 'focus'] as const,
  focusHistory: (limit?: number) =>
    [...tunaKeys.all, 'focus', 'history', limit] as const,
};

// Fetch pet data
async function fetchTunaPet(): Promise<TunaPetResponse> {
  const res = await fetch('/api/v1/tuna/pet');
  if (!res.ok) {
    throw new Error('Failed to fetch pet');
  }
  return res.json();
}

// Update pet
async function updateTunaPet(data: {
  name?: string;
}): Promise<{ pet: TunaPet }> {
  const res = await fetch('/api/v1/tuna/pet', {
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
async function feedTuna(): Promise<FeedResponse> {
  const res = await fetch('/api/v1/tuna/pet/feed', {
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
  const res = await fetch('/api/v1/tuna/xp', {
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
 * Hook for fetching and managing Tuna pet data
 */
export function useTuna() {
  return useQuery({
    queryKey: tunaKeys.pet(),
    queryFn: fetchTunaPet,
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook for updating Tuna pet (name, etc.)
 */
export function useUpdateTuna() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTunaPet,
    onSuccess: (data) => {
      // Update pet in cache
      queryClient.setQueryData(
        tunaKeys.pet(),
        (old: TunaPetResponse | undefined) => ({
          ...old,
          pet: data.pet,
        })
      );
    },
  });
}

/**
 * Hook for feeding Tuna
 */
export function useFeedTuna() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: feedTuna,
    onSuccess: (data) => {
      // Update pet in cache with optimistic update
      queryClient.setQueryData(
        tunaKeys.pet(),
        (old: TunaPetResponse | undefined) => ({
          ...old,
          pet: data.pet,
        })
      );
    },
  });
}

/**
 * Hook for awarding XP to Tuna
 */
export function useAwardXp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: awardXp,
    onSuccess: (data) => {
      // Update pet in cache
      queryClient.setQueryData(
        tunaKeys.pet(),
        (old: TunaPetResponse | undefined) => ({
          ...old,
          pet: data.pet,
        })
      );
    },
  });
}

/**
 * Hook for invalidating all tuna-related queries
 */
export function useInvalidateTuna() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: tunaKeys.all });
  };
}
