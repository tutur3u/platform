import { useQueryClient } from '@tanstack/react-query';
import { NotificationRuntime } from '@tuturuuu/ui/custom/notification-runtime';
import SatelliteNotificationPopover from '@tuturuuu/ui/custom/satellite-notification-popover';
import type { AnchorHTMLAttributes } from 'react';
import { useCopy } from './i18n';

function CentralLink({
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props} href={new URL(href, 'https://tuturuuu.com').href} />;
}
export function ColabNotifications({ userId }: { userId: string }) {
  const copy = useCopy();
  const c = copy.notifications;
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
        webAppUrl="https://tuturuuu.com"
        notificationsText={c.notifications}
        noNotificationsText={c['no-notifications']}
        viewAllText={c['view-all']}
        markAsReadText={c['mark-as-read']}
        markAsUnreadText={c['mark-as-unread']}
        inboxText={c.inbox}
        archiveText={c.archive}
        archiveAllText={c['archive-all']}
        emptyArchiveText={c['empty-archive']}
        loadingMoreText={c['loading-more']}
        retryText={copy.common.retry}
        acceptText={c.accept}
        declineText={c.decline}
        acceptedText={copy['workspace-invitation']['accept-success']}
        declinedText={copy['workspace-invitation']['decline-success']}
      />
    </NotificationRuntime>
  );
}
