import NotificationPopoverClient from '@tuturuuu/ui/custom/notification-popover-client';
import { getTranslations } from 'next-intl/server';
import { getSatelliteAppSession } from '../auth';

/** The central Tuturuuu web app URL, resolved from env or defaults */
function getTtrUrl(): string {
  const prod = process.env.NODE_ENV === 'production';
  return (
    process.env.TTR_URL ||
    (prod
      ? 'https://tuturuuu.com'
      : `http://localhost:${process.env.CENTRAL_PORT || 7803}`)
  );
}

export default async function NotificationPopover({
  userId,
}: {
  userId?: string;
} = {}) {
  const t = await getTranslations();
  const resolvedUserId = userId ?? (await getSatelliteAppSession())?.sub;

  return (
    <NotificationPopoverClient
      userId={resolvedUserId}
      noNotificationsText={t('notifications.no-notifications')}
      notificationsText={t('notifications.notifications')}
      viewAllText={t('notifications.view-all')}
      markAsReadText={t('notifications.mark-as-read')}
      markAsUnreadText={t('notifications.mark-as-unread')}
      inboxText={t('notifications.inbox')}
      archiveText={t('notifications.archive')}
      archiveAllText={t('notifications.archive-all')}
      emptyArchiveText={t('notifications.empty-archive')}
      loadingMoreText={t('notifications.loading-more')}
      retryText={t('common.retry')}
      acceptText={t('notifications.accept')}
      declineText={t('notifications.decline')}
      acceptedText={t('workspace-invitation.accept-success')}
      declinedText={t('workspace-invitation.decline-success')}
      webAppUrl={getTtrUrl()}
    />
  );
}
