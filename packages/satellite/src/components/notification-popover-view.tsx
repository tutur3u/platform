'use client';

import NotificationPopoverClient from '@tuturuuu/ui/custom/notification-popover-client';
import { useTranslations } from 'next-intl';

/**
 * Client counterpart of `notification-popover` for satellites rendered
 * without React Server Components (TanStack Start). Labels come from the
 * client intl provider; the actor is supplied by the page model.
 */
export default function NotificationPopoverView({
  userId,
  webAppUrl,
}: {
  userId?: string;
  webAppUrl: string;
}) {
  const t = useTranslations();
  return (
    <NotificationPopoverClient
      userId={userId}
      noNotificationsText={t('notifications.no-notifications')}
      notificationsText={t('notifications.notifications')}
      viewAllText={t('notifications.view-all')}
      markAsReadText={t('notifications.mark-as-read')}
      markAsUnreadText={t('notifications.mark-as-unread')}
      updateErrorText={t('notifications.update-error')}
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
      webAppUrl={webAppUrl}
    />
  );
}
