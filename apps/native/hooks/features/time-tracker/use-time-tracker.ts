import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { TimeTrackingSession } from '@tuturuuu/types';

import { queryKeys, type SessionFilters } from '@/lib/query';
import { supabase } from '@/lib/supabase';

/**
 * Fetch time tracking sessions for a workspace
 */
export function useTimeSessions(
  wsId: string | undefined,
  filters?: SessionFilters
) {
  return useQuery({
    queryKey: queryKeys.timeTracker.sessions(wsId ?? '', filters),
    queryFn: async () => {
      if (!wsId) return [];

      let query = supabase
        .from('time_tracking_sessions')
        .select(
          `
          *,
          category:time_tracking_categories (
            id,
            name,
            color
          )
        `
        )
        .eq('ws_id', wsId)
        .order('start_time', { ascending: false });

      // Apply filters
      if (filters?.categoryId) {
        query = query.eq('category_id', filters.categoryId);
      }
      if (filters?.userId) {
        query = query.eq('user_id', filters.userId);
      }
      if (filters?.startDate) {
        query = query.gte('start_time', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('start_time', filters.endDate);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(error.message);
      }

      return data ?? [];
    },
    enabled: !!wsId,
  });
}

/**
 * Fetch running sessions for a user
 */
export function useRunningSessions(
  wsId: string | undefined,
  userId: string | undefined
) {
  return useQuery({
    queryKey: queryKeys.timeTracker.running(wsId ?? '', userId ?? ''),
    queryFn: async () => {
      if (!wsId || !userId) return [];

      const { data, error } = await supabase
        .from('time_tracking_sessions')
        .select(
          `
          *,
          category:time_tracking_categories (
            id,
            name,
            color
          )
        `
        )
        .eq('ws_id', wsId)
        .eq('user_id', userId)
        .is('end_time', null)
        .order('start_time', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return data ?? [];
    },
    enabled: !!wsId && !!userId,
    // Poll every 30 seconds for running timer updates
    refetchInterval: 30000,
  });
}

/**
 * Fetch time tracking categories
 */
export function useTimeCategories(wsId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.timeTracker.categories(wsId ?? ''),
    queryFn: async () => {
      if (!wsId) return [];

      const { data, error } = await supabase
        .from('time_tracking_categories')
        .select('*')
        .eq('ws_id', wsId)
        .order('name', { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      return data ?? [];
    },
    enabled: !!wsId,
  });
}

/**
 * Time tracking mutation hooks
 */
export function useTimeTrackerMutations(wsId: string, userId: string) {
  const queryClient = useQueryClient();

  const startSession = useMutation({
    mutationFn: async (params: {
      title?: string;
      description?: string;
      category_id?: string;
    }) => {
      const { data, error } = await supabase
        .from('time_tracking_sessions')
        .insert({
          ws_id: wsId,
          user_id: userId,
          title: params.title ?? 'Work Session',
          description: params.description,
          category_id: params.category_id,
          start_time: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeTracker.running(wsId, userId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeTracker.all(wsId),
      });
    },
  });

  const stopSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await supabase
        .from('time_tracking_sessions')
        .update({ end_time: new Date().toISOString() })
        .eq('id', sessionId)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeTracker.running(wsId, userId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeTracker.all(wsId),
      });
    },
  });

  const updateSession = useMutation({
    mutationFn: async ({
      sessionId,
      updates,
    }: {
      sessionId: string;
      updates: Partial<TimeTrackingSession>;
    }) => {
      const { data, error } = await supabase
        .from('time_tracking_sessions')
        .update(updates)
        .eq('id', sessionId)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeTracker.all(wsId),
      });
    },
  });

  const deleteSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('time_tracking_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeTracker.all(wsId),
      });
    },
  });

  return {
    startSession,
    stopSession,
    updateSession,
    deleteSession,
  };
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(
  startTime: string,
  endTime?: string | null
): string {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const diffMs = end - start;

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Format duration as HH:MM:SS
 */
export function formatDurationClock(
  startTime: string,
  endTime?: string | null
): string {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const diffMs = end - start;

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
