import { useQueryClient } from '@tanstack/react-query';
import { notificationLabelsFromMessages } from '@tuturuuu/ui/custom/notification-labels';
import { NotificationRuntime } from '@tuturuuu/ui/custom/notification-runtime';
import SatelliteNotificationPopover from '@tuturuuu/ui/custom/satellite-notification-popover';
import { type AnchorHTMLAttributes, useMemo } from 'react';
import { useCopy } from './i18n';

function CentralLink({
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props} href={new URL(href, 'https://tuturuuu.com').href} />;
}
export function ColabNotifications({ userId }: { userId: string }) {
  const copy = useCopy();
  const labels = useMemo(() => notificationLabelsFromMessages(copy), [copy]);
  const cache = useQueryClient();
  return (
    <NotificationRuntime
      value={{
        params: { wsId: 'personal' },
        pathname: location.pathname,
        Link: CentralLink,
        realtime: false,
        router: {
          push: (url) =>
            location.assign(new URL(url, 'https://tuturuuu.com').href),
          refresh: () => {
            void cache.invalidateQueries({ queryKey: ['notifications'] });
          },
        },
      }}
    >
      <SatelliteNotificationPopover
        userId={userId}
        pollIntervalMs={30_000}
        webAppUrl="https://tuturuuu.com"
        labels={labels}
      />
    </NotificationRuntime>
  );
}
