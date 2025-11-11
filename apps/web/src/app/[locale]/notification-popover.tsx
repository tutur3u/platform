import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { getTranslations } from 'next-intl/server';
import NotificationPopoverClient from './notification-popover-client';

export default async function NotificationPopover() {
  const t = await getTranslations('notifications');
  const user = await getCurrentSupabaseUser();

  const noNotifications = t('no-notifications');
  const viewAllText = t('view-all');
  const markAsReadText = t('mark-as-read');
  const markAsUnreadText = t('mark-as-unread');
  const notificationsText = t('notifications');

  return (
    <NotificationPopoverClient
      userId={user?.id}
      noNotificationsText={noNotifications}
      notificationsText={notificationsText}
      viewAllText={viewAllText}
      markAsReadText={markAsReadText}
      markAsUnreadText={markAsUnreadText}
    />
  );
}
