import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationRuntime } from './notification-runtime';
import SatelliteNotificationPopover from './satellite-notification-popover';

const { unread, list } = vi.hoisted(() => ({ unread: vi.fn(), list: vi.fn() }));
vi.mock('@tuturuuu/ui/hooks/use-notifications', () => ({
  useUnreadCount: unread,
  useInfiniteNotifications: list,
  useNotificationSubscription: vi.fn(),
  useMarkAllAsRead: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateNotification: () => ({ mutate: vi.fn(), isPending: false }),
  dedupeNotifications: () => [],
}));
vi.mock('./notification-list', () => ({ NotificationList: () => null }));
describe('satellite freshness policy', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });
  it.each([
    [undefined, 120_000],
    [30_000, 30_000],
  ])(
    'uses the default or an explicit app polling interval',
    (pollIntervalMs, expected) => {
      unread.mockReturnValue({ data: 0 });
      list.mockReturnValue({ data: { pages: [] }, isLoading: false });
      render(
        <QueryClientProvider client={new QueryClient()}>
          <NotificationRuntime
            value={{
              params: { wsId: 'personal' },
              pathname: '/',
              router: { push: vi.fn(), refresh: vi.fn() },
              Link: ({ children }) => <span>{children}</span>,
              realtime: false,
            }}
          >
            <SatelliteNotificationPopover
              userId="actor"
              pollIntervalMs={pollIntervalMs}
              noNotificationsText="Empty"
              notificationsText="Notifications"
              viewAllText="View all"
              markAsReadText="Read"
              markAsUnreadText="Unread"
            />
          </NotificationRuntime>
        </QueryClientProvider>
      );
      expect(unread.mock.calls[0]?.[1].refetchInterval).toBe(expected);
      expect(
        list.mock.calls.every(
          ([options]) => options.refetchInterval === expected
        )
      ).toBe(true);
    }
  );
});
