import NotificationPopoverClient from '@tuturuuu/ui/custom/notification-popover-client';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { getTranslations } from 'next-intl/server';

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
      webAppUrl={getTtrUrl()}
    />
  );
}
