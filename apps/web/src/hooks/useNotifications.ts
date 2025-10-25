import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { useEffect } from 'react';

export type NotificationType =
  | 'task_assigned'
  | 'task_updated'
  | 'task_mention'
  | 'workspace_invite';

export interface Notification {
  id: string;
  ws_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  description: string | null;
  data: Record<string, any>;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
  created_by: string | null;
}

interface UseNotificationsOptions {
  wsId: string;
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
  type?: NotificationType;
}

/**
 * Hook to fetch notifications with pagination
 */
export function useNotifications({
  wsId,
  limit = 20,
  offset = 0,
  unreadOnly = false,
  type,
}: UseNotificationsOptions) {
  return useQuery({
    queryKey: ['notifications', wsId, limit, offset, unreadOnly, type],
    queryFn: async () => {
      const params = new URLSearchParams({
        wsId,
        limit: limit.toString(),
        offset: offset.toString(),
        unreadOnly: unreadOnly.toString(),
        ...(type && { type }),
      });

      const response = await fetch(`/api/v1/notifications?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }

      const data = await response.json();
      return data as {
        notifications: Notification[];
        count: number;
        limit: number;
        offset: number;
      };
    },
    enabled: !!wsId,
  });
}

/**
 * Hook to get unread notification count
 */
export function useUnreadCount(wsId: string) {
  return useQuery({
    queryKey: ['notifications', 'unread-count', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/notifications/unread-count?wsId=${wsId}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch unread count');
      }

      const data = await response.json();
      return data.count as number;
    },
    enabled: !!wsId,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

/**
 * Hook to mark a notification as read/unread
 */
export function useUpdateNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, read }: { id: string; read: boolean }) => {
      const response = await fetch(`/api/v1/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read }),
      });

      if (!response.ok) {
        throw new Error('Failed to update notification');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/**
 * Hook to mark all notifications as read
 */
export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (wsId: string) => {
      const response = await fetch('/api/v1/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wsId, action: 'mark_all_read' }),
      });

      if (!response.ok) {
        throw new Error('Failed to mark all as read');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/**
 * Hook to delete a notification
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/v1/notifications/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete notification');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/**
 * Hook to subscribe to realtime notification updates
 */
export function useNotificationSubscription(wsId: string, userId: string) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  // Subscribe to realtime updates using useEffect
  useEffect(() => {
    if (!wsId || !userId) return;

    const channel = supabase
      .channel(`notifications:${wsId}:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `ws_id=eq.${wsId},user_id=eq.${userId}`,
        },
        () => {
          // Invalidate queries when notifications change
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      supabase.removeChannel(channel);
    };
  }, [wsId, userId, supabase, queryClient]);
}
