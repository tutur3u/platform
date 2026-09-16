import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

export const NOTIFICATION_REFRESH_INTERVAL_MS = 30_000;

interface NotificationSubscriptionEntry {
  queryClients: Map<QueryClient, number>;
  interval: ReturnType<typeof setInterval>;
  onVisibilityChange: () => void;
}

const registry = new Map<string, NotificationSubscriptionEntry>();

function invalidateVisibleNotifications(entry: NotificationSubscriptionEntry) {
  if (document.visibilityState === 'hidden') return;
  for (const queryClient of entry.queryClients.keys()) {
    // Only active queries refetch; closed inboxes remain lazy.
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }
}

function stopEntry(entry: NotificationSubscriptionEntry) {
  clearInterval(entry.interval);
  document.removeEventListener('visibilitychange', entry.onVisibilityChange);
}

/**
 * Share authenticated API refreshes across notification consumers.
 * Notifications are server-owned: postgres_changes cannot filter their columns
 * using browser roles, even when a user has a valid application session.
 */
export function useNotificationSubscription(
  _wsId: string | null,
  userId: string
) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    let entry = registry.get(userId);
    if (!entry) {
      const queryClients = new Map<QueryClient, number>();
      const refresh = () => {
        const current = registry.get(userId);
        if (current) invalidateVisibleNotifications(current);
      };
      entry = {
        queryClients,
        interval: setInterval(refresh, NOTIFICATION_REFRESH_INTERVAL_MS),
        onVisibilityChange: refresh,
      };
      registry.set(userId, entry);
      document.addEventListener('visibilitychange', refresh);
    }
    entry.queryClients.set(
      queryClient,
      (entry.queryClients.get(queryClient) ?? 0) + 1
    );

    return () => {
      const count = entry.queryClients.get(queryClient) ?? 0;
      if (count <= 1) entry.queryClients.delete(queryClient);
      else entry.queryClients.set(queryClient, count - 1);
      if (entry.queryClients.size === 0) {
        stopEntry(entry);
        registry.delete(userId);
      }
    };
  }, [userId, queryClient]);
}

export function __resetNotificationSubscriptionRegistryForTests() {
  for (const entry of registry.values()) stopEntry(entry);
  registry.clear();
}
