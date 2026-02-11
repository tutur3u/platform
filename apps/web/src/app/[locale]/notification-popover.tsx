import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { getTranslations } from 'next-intl/server';
import NotificationPopoverClient from './notification-popover-client';

export default async function NotificationPopover() {
  const t = await getTranslations('notifications');
  const user = await getCurrentSupabaseUser();

  return (
    <NotificationPopoverClient
      userId={user?.id}
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
    />
  );
}
