import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
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
  | 'security_alert'
  | 'report_approved'
  | 'report_rejected'
  | 'post_approved'
  | 'post_rejected';

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

interface NotificationsPage {
  notifications: Notification[];
  count: number;
  limit: number;
  offset: number;
}

interface UseNotificationsOptions {
  wsId?: string;
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
  readOnly?: boolean;
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
  readOnly = false,
  type,
}: UseNotificationsOptions) {
  return useQuery({
    queryKey: [
      'notifications',
      wsId || 'all',
      limit,
      offset,
      unreadOnly,
      readOnly,
      type,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        unreadOnly: unreadOnly.toString(),
        readOnly: readOnly.toString(),
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
      return data as NotificationsPage;
    },
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch notifications with infinite scroll support
 */
export function useInfiniteNotifications({
  wsId,
  unreadOnly = false,
  readOnly = false,
  pageSize = 20,
}: {
  wsId?: string;
  unreadOnly?: boolean;
  readOnly?: boolean;
  pageSize?: number;
}) {
  return useInfiniteQuery({
    queryKey: [
      'notifications',
      'infinite',
      wsId || 'all',
      unreadOnly,
      readOnly,
    ],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: pageParam.toString(),
        unreadOnly: unreadOnly.toString(),
        readOnly: readOnly.toString(),
        ...(wsId && { wsId }),
      });

      const response = await fetch(`/api/v1/notifications?${params}`);
      if (!response.ok) throw new Error('Failed to fetch notifications');
      return (await response.json()) as NotificationsPage;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.limit;
      return nextOffset < lastPage.count ? nextOffset : undefined;
    },
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to get unread notification count.
 * If wsId is provided, scopes to that workspace. Otherwise returns total unread count.
 */
export function useUnreadCount(wsId?: string) {
  return useQuery({
    queryKey: ['notifications', 'unread-count', wsId || 'all'],
    queryFn: async () => {
      const params = wsId ? `?wsId=${wsId}` : '';
      const response = await fetch(
        `/api/v1/notifications/unread-count${params}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch unread count');
      }

      const data = await response.json();
      return data.count as number;
    },
    refetchInterval: 30000,
  });
}

/**
 * Hook to mark a notification as read/unread.
 * Optimistically moves the notification between Inbox and Archive tabs.
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
      await queryClient.cancelQueries({ queryKey: ['notifications'] });

      const previousData = queryClient.getQueriesData({
        queryKey: ['notifications'],
      });

      // Find the notification from any cached infinite query
      type InfiniteData = {
        pages: NotificationsPage[];
        pageParams: number[];
      };
      let targetNotification: Notification | undefined;
      const allInfiniteQueries = queryClient.getQueriesData<InfiniteData>({
        queryKey: ['notifications', 'infinite'],
      });

      for (const [, data] of allInfiniteQueries) {
        if (!data?.pages) continue;
        for (const page of data.pages) {
          const found = page.notifications.find((n) => n.id === id);
          if (found) {
            targetNotification = found;
            break;
          }
        }
        if (targetNotification) break;
      }

      if (targetNotification) {
        const updatedNotification: Notification = {
          ...targetNotification,
          read_at: read ? new Date().toISOString() : null,
        };

        // Move notification between tabs optimistically.
        // Query key shape: ['notifications', 'infinite', wsId, unreadOnly, readOnly]
        for (const [queryKey, data] of allInfiniteQueries) {
          if (!data?.pages) continue;

          const key = queryKey as readonly unknown[];
          const isInboxQuery = key[3] === true; // unreadOnly
          const isArchiveQuery = key[4] === true; // readOnly

          if (read && isInboxQuery) {
            // Marking as read → remove from inbox
            queryClient.setQueryData<InfiniteData>(queryKey, {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                count: Math.max(0, page.count - 1),
                notifications: page.notifications.filter((n) => n.id !== id),
              })),
            });
          } else if (read && isArchiveQuery) {
            // Marking as read → prepend to archive
            queryClient.setQueryData<InfiniteData>(queryKey, {
              ...data,
              pages: data.pages.map((page, i) =>
                i === 0
                  ? {
                      ...page,
                      count: page.count + 1,
                      notifications: [
                        updatedNotification,
                        ...page.notifications,
                      ],
                    }
                  : page
              ),
            });
          } else if (!read && isInboxQuery) {
            // Marking as unread → prepend to inbox
            queryClient.setQueryData<InfiniteData>(queryKey, {
              ...data,
              pages: data.pages.map((page, i) =>
                i === 0
                  ? {
                      ...page,
                      count: page.count + 1,
                      notifications: [
                        updatedNotification,
                        ...page.notifications,
                      ],
                    }
                  : page
              ),
            });
          } else if (!read && isArchiveQuery) {
            // Marking as unread → remove from archive
            queryClient.setQueryData<InfiniteData>(queryKey, {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                count: Math.max(0, page.count - 1),
                notifications: page.notifications.filter((n) => n.id !== id),
              })),
            });
          } else {
            // Generic infinite query → update in place
            queryClient.setQueryData<InfiniteData>(queryKey, {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                notifications: page.notifications.map((n) =>
                  n.id === id ? updatedNotification : n
                ),
              })),
            });
          }
        }
      }

      // Update regular (non-infinite) notification queries
      queryClient.setQueriesData<NotificationsPage>(
        { queryKey: ['notifications'] },
        (old) => {
          if (!old || typeof old !== 'object' || !('notifications' in old))
            return old;
          return {
            ...old,
            notifications: old.notifications.map((n) =>
              n.id === id
                ? { ...n, read_at: read ? new Date().toISOString() : null }
                : n
            ),
          };
        }
      );

      // Optimistically update unread count
      queryClient.setQueriesData<number>(
        { queryKey: ['notifications', 'unread-count'] },
        (old) => {
          if (typeof old !== 'number') return old;
          return read ? Math.max(0, old - 1) : old + 1;
        }
      );

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: async () => {
      // Background refetch to ensure server consistency across all tabs
      await queryClient.invalidateQueries({
        queryKey: ['notifications'],
        refetchType: 'active',
      });
    },
  });
}

/**
 * Hook to mark all notifications as read (archive all).
 * Optimistically clears inbox and moves items to archive.
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
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });

      const previousData = queryClient.getQueriesData({
        queryKey: ['notifications'],
      });

      type InfiniteData = {
        pages: NotificationsPage[];
        pageParams: number[];
      };

      // Collect all unread notifications from inbox queries
      const archivedNotifications: Notification[] = [];
      const allInfiniteQueries = queryClient.getQueriesData<InfiniteData>({
        queryKey: ['notifications', 'infinite'],
      });

      const now = new Date().toISOString();

      for (const [queryKey, data] of allInfiniteQueries) {
        if (!data?.pages) continue;

        const key = queryKey as readonly unknown[];
        const isInboxQuery = key[3] === true; // unreadOnly

        if (isInboxQuery) {
          // Collect notifications and mark them as read
          for (const page of data.pages) {
            for (const n of page.notifications) {
              archivedNotifications.push({ ...n, read_at: now });
            }
          }
          // Clear the inbox
          queryClient.setQueryData<InfiniteData>(queryKey, {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              count: 0,
              notifications: [],
            })),
          });
        }
      }

      // Prepend archived notifications to archive queries
      if (archivedNotifications.length > 0) {
        for (const [queryKey, data] of allInfiniteQueries) {
          if (!data?.pages) continue;

          const key = queryKey as readonly unknown[];
          const isArchiveQuery = key[4] === true; // readOnly

          if (isArchiveQuery) {
            queryClient.setQueryData<InfiniteData>(queryKey, {
              ...data,
              pages: data.pages.map((page, i) =>
                i === 0
                  ? {
                      ...page,
                      count: page.count + archivedNotifications.length,
                      notifications: [
                        ...archivedNotifications,
                        ...page.notifications,
                      ],
                    }
                  : page
              ),
            });
          }
        }
      }

      // Set unread count to 0
      queryClient.setQueriesData<number>(
        { queryKey: ['notifications', 'unread-count'] },
        (old) => {
          if (typeof old !== 'number') return old;
          return 0;
        }
      );

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['notifications'],
        refetchType: 'active',
      });
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

  useEffect(() => {
    if (!userId) return;

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
          const newRecord = payload.new as Notification;
          if (newRecord?.data?.action_taken) {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            queryClient.invalidateQueries({
              queryKey: ['notifications', 'unread-count'],
            });
          }
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
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({
            queryKey: ['notifications', 'unread-count'],
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, supabase, queryClient]);
}
