import { getTranslations } from 'next-intl/server';
import NotificationPopoverClient from './notification-popover-client';

export default async function NotificationPopover({
  userId,
}: {
  userId: string;
}) {
  const t = await getTranslations('notifications');
  const tCommon = await getTranslations('common');

  return (
    <NotificationPopoverClient
      userId={userId}
      noNotificationsText={t('no-notifications')}
      notificationsText={t('notifications')}
      viewAllText={t('view-all')}
      markAsReadText={t('mark-as-read')}
      markAsUnreadText={t('mark-as-unread')}
      inboxText={t('inbox')}
      archiveText={t('archive')}
      archiveAllText={t('archive-all')}
      emptyArchiveText={t('empty-archive')}
      loadingMoreText={t('loading-more')}
      retryText={tCommon('retry')}
      acceptText={t('accept')}
      declineText={t('decline')}
      acceptedText={t('workspace-invite-accepted')}
      declinedText={t('workspace-invite-declined')}
    />
  );
}
