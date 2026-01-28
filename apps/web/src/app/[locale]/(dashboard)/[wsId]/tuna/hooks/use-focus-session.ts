'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import type { TunaAchievement, TunaFocusSession, TunaPet } from '../types/tuna';
import { tunaKeys } from './use-tuna';

interface FocusResponse {
  active_session: TunaFocusSession | null;
  recent_sessions: TunaFocusSession[];
  stats: {
    total_sessions: number;
    completed_sessions: number;
    total_minutes: number;
    total_xp_earned: number;
    completion_rate: number;
  };
}

interface StartFocusResponse {
  session: TunaFocusSession;
}

interface CompleteFocusResponse {
  session: TunaFocusSession;
  pet: TunaPet;
  xp_earned: number;
  achievements_unlocked: TunaAchievement[];
}

interface FocusHistoryResponse {
  sessions: TunaFocusSession[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
  daily_data: Array<{
    date: string;
    focus_minutes: number;
    focus_sessions_completed: number;
  }>;
  week_stats: {
    total_minutes: number;
    total_sessions: number;
    avg_daily_minutes: number;
  };
  month_stats: {
    total_minutes: number;
    total_sessions: number;
    avg_daily_minutes: number;
  };
}

// Fetch focus data
async function fetchFocusData(): Promise<FocusResponse> {
  const res = await fetch('/api/v1/tuna/focus');
  if (!res.ok) {
    throw new Error('Failed to fetch focus data');
  }
  return res.json();
}

// Start focus session
async function startFocusSession(data: {
  planned_duration: number;
  goal?: string;
}): Promise<StartFocusResponse> {
  const res = await fetch('/api/v1/tuna/focus/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to start focus session');
  }
  return res.json();
}

// Complete focus session
async function completeFocusSession(data: {
  session_id: string;
  notes?: string;
}): Promise<CompleteFocusResponse> {
  const res = await fetch('/api/v1/tuna/focus/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error('Failed to complete focus session');
  }
  return res.json();
}

// Fetch focus history
async function fetchFocusHistory(
  limit = 20,
  offset = 0
): Promise<FocusHistoryResponse> {
  const res = await fetch(
    `/api/v1/tuna/focus/history?limit=${limit}&offset=${offset}`
  );
  if (!res.ok) {
    throw new Error('Failed to fetch focus history');
  }
  return res.json();
}

// Delete focus session
async function deleteFocusSession(
  sessionId: string
): Promise<{ success: boolean; deleted_id: string }> {
  const res = await fetch(`/api/v1/tuna/focus/${sessionId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to delete focus session');
  }
  return res.json();
}

/**
 * Hook for fetching focus session data (active + recent)
 */
export function useFocusSessions() {
  return useQuery({
    queryKey: tunaKeys.focus(),
    queryFn: fetchFocusData,
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: (query) => {
      // Refetch every 10 seconds if there's an active session
      return query.state.data?.active_session ? 10000 : false;
    },
  });
}

/**
 * Hook for starting a focus session
 */
export function useStartFocusSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: startFocusSession,
    onSuccess: (data) => {
      // Update cache with new active session
      queryClient.setQueryData(
        tunaKeys.focus(),
        (old: FocusResponse | undefined) => ({
          ...old,
          active_session: data.session,
          recent_sessions: old?.recent_sessions ?? [],
          stats: old?.stats ?? {
            total_sessions: 0,
            completed_sessions: 0,
            total_minutes: 0,
            total_xp_earned: 0,
            completion_rate: 0,
          },
        })
      );
    },
  });
}

/**
 * Hook for completing a focus session
 */
export function useCompleteFocusSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: completeFocusSession,
    onSuccess: (data) => {
      // Update focus cache
      queryClient.setQueryData(
        tunaKeys.focus(),
        (old: FocusResponse | undefined) => ({
          active_session: null,
          recent_sessions: [data.session, ...(old?.recent_sessions ?? [])],
          stats: {
            ...(old?.stats ?? {
              total_sessions: 0,
              completed_sessions: 0,
              total_minutes: 0,
              total_xp_earned: 0,
              completion_rate: 0,
            }),
            total_sessions: (old?.stats?.total_sessions ?? 0) + 1,
            completed_sessions:
              (old?.stats?.completed_sessions ?? 0) +
              (data.session.completed ? 1 : 0),
            total_minutes:
              (old?.stats?.total_minutes ?? 0) +
              (data.session.actual_duration ?? 0),
            total_xp_earned:
              (old?.stats?.total_xp_earned ?? 0) + data.xp_earned,
          },
        })
      );

      // Update pet data
      queryClient.setQueryData(tunaKeys.pet(), (old: unknown) => {
        if (old && typeof old === 'object' && 'pet' in old) {
          return {
            ...old,
            pet: data.pet,
          };
        }
        return old;
      });

      // Invalidate achievements if any were unlocked
      if (data.achievements_unlocked.length > 0) {
        queryClient.invalidateQueries({ queryKey: tunaKeys.achievements() });
      }

      // Invalidate focus history
      queryClient.invalidateQueries({
        queryKey: [...tunaKeys.all, 'focus', 'history'],
      });
    },
  });
}

/**
 * Hook for fetching focus session history
 */
export function useFocusHistory(limit = 20) {
  return useQuery({
    queryKey: tunaKeys.focusHistory(limit),
    queryFn: () => fetchFocusHistory(limit),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook for managing focus timer state
 */
export function useFocusTimer() {
  const { data } = useFocusSessions();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const activeSession = data?.active_session;
  const isActive = !!activeSession;

  // Calculate initial elapsed time
  useEffect(() => {
    if (activeSession) {
      const startTime = new Date(activeSession.started_at).getTime();
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000);
      setElapsedSeconds(elapsed);
    } else {
      setElapsedSeconds(0);
    }
  }, [activeSession]);

  // Timer tick
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive]);

  const plannedDurationSeconds = activeSession
    ? activeSession.planned_duration * 60
    : 0;

  const remainingSeconds = Math.max(0, plannedDurationSeconds - elapsedSeconds);

  const progress =
    plannedDurationSeconds > 0
      ? Math.min(100, (elapsedSeconds / plannedDurationSeconds) * 100)
      : 0;

  const isOvertime = elapsedSeconds > plannedDurationSeconds;

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    isActive,
    session: activeSession,
    elapsedSeconds,
    remainingSeconds,
    progress,
    isOvertime,
    formattedElapsed: formatTime(elapsedSeconds),
    formattedRemaining: formatTime(remainingSeconds),
  };
}

/**
 * Hook for deleting a focus session
 */
export function useDeleteFocusSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteFocusSession,
    onSuccess: (data) => {
      // Update focus cache - remove deleted session from recent
      queryClient.setQueryData(
        tunaKeys.focus(),
        (old: FocusResponse | undefined) => {
          if (!old) return old;
          return {
            ...old,
            recent_sessions: old.recent_sessions.filter(
              (s) => s.id !== data.deleted_id
            ),
          };
        }
      );

      // Invalidate history cache - use partial match to catch all limit variations
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'tuna' &&
          query.queryKey[1] === 'focus' &&
          query.queryKey[2] === 'history',
      });
    },
  });
}
