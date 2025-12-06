import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { useEffect } from 'react';

export type NotificationType =
  | 'task_assigned'
  | 'task_updated'
  | 'task_completed'
  | 'task_reopened'
  | 'task_priority_changed'
  | 'task_due_date_changed'
  | 'task_start_date_changed'
  | 'task_estimation_changed'
  | 'task_moved'
  | 'task_mention'
  | 'task_title_changed'
  | 'task_description_changed'
  | 'task_label_added'
  | 'task_label_removed'
  | 'task_project_linked'
  | 'task_project_unlinked'
  | 'task_assignee_removed'
  | 'workspace_invite'
  | 'system_announcement'
  | 'account_update'
  | 'security_alert';

export interface NotificationActor {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface Notification {
  id: string;
  ws_id: string | null; // Can be null for user-scoped notifications
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
  actor: NotificationActor | null;
}

interface UseNotificationsOptions {
  wsId?: string;
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
  type?: NotificationType;
}

/**
 * Hook to fetch notifications with pagination
 * @param wsId - If provided, filters to specific workspace. If omitted, fetches all notifications across all workspaces.
 */
export function useNotifications({
  wsId,
  limit = 20,
  offset = 0,
  unreadOnly = false,
  type,
}: UseNotificationsOptions) {
  return useQuery({
    queryKey: ['notifications', wsId || 'all', limit, offset, unreadOnly, type],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        unreadOnly: unreadOnly.toString(),
        ...(wsId && { wsId }),
        ...(type && { type }),
      });

      const url = `/api/v1/notifications?${params}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch notifications: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return data as {
        notifications: Notification[];
        count: number;
        limit: number;
        offset: number;
      };
    },
    staleTime: 30000, // Keep data fresh for 30s to prevent excessive refetches
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
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
    onMutate: async ({ id, read }) => {
      // Cancel any outgoing refetches to prevent race conditions
      await queryClient.cancelQueries({ queryKey: ['notifications'] });

      // Snapshot the previous value for rollback
      const previousData = queryClient.getQueriesData({
        queryKey: ['notifications'],
      });

      // Optimistically update to the new state IN PLACE (maintains order)
      queryClient.setQueriesData<{
        notifications: Notification[];
        count: number;
        limit: number;
        offset: number;
      }>({ queryKey: ['notifications'] }, (old) => {
        if (!old) return old;

        const updatedNotifications = old.notifications.map((notification) =>
          notification.id === id
            ? {
                ...notification,
                read_at: read ? new Date().toISOString() : null,
              }
            : notification
        );

        return {
          ...old,
          notifications: updatedNotifications,
        };
      });

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSuccess: async () => {
      // Invalidate and refetch the unread count immediately
      await queryClient.invalidateQueries({
        queryKey: ['notifications', 'unread-count'],
        refetchType: 'active',
      });
    },
    onSettled: async (_data, error) => {
      // If there was an error, refetch everything to ensure consistency
      if (error) {
        await queryClient.invalidateQueries({
          queryKey: ['notifications'],
          refetchType: 'active',
        });
      }
    },
  });
}

/**
 * Hook to mark all notifications as read
 * @param wsId - If provided, marks only notifications for that workspace. If omitted, marks all notifications as read.
 */
export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (wsId?: string) => {
      const response = await fetch('/api/v1/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(wsId && { wsId }),
          action: 'mark_all_read',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to mark all as read');
      }

      return response.json();
    },
    onSuccess: async () => {
      // Force immediate refetch of notifications
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['notifications'],
          refetchType: 'active',
        }),
        queryClient.refetchQueries({
          queryKey: ['notifications'],
          type: 'active',
        }),
        queryClient.invalidateQueries({
          queryKey: ['notifications', 'unread-count'],
          refetchType: 'active',
        }),
      ]);
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
 * Subscribes to all notifications for the user, regardless of workspace
 */
export function useNotificationSubscription(
  _wsId: string | null,
  userId: string
) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  // Subscribe to realtime updates using useEffect
  useEffect(() => {
    if (!userId) return;

    // Subscribe to all user's notifications (including user-scoped with null ws_id)
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Invalidate on INSERT (new notifications)
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({
            queryKey: ['notifications', 'unread-count'],
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // For read/unread updates, we use optimistic updates in useUpdateNotification
          // For action updates (like workspace_invite accepted/declined), we need to refetch
          const newRecord = payload.new as Notification;

          // If the notification data has action_taken, it's an action completion - refetch
          if (newRecord?.data?.action_taken) {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            queryClient.invalidateQueries({
              queryKey: ['notifications', 'unread-count'],
            });
          }
          // Otherwise, the optimistic update in useUpdateNotification handles it
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Invalidate on DELETE
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({
            queryKey: ['notifications', 'unread-count'],
          });
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, supabase, queryClient]);
}
