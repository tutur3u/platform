import { notificationCodeTextFrom } from '@tuturuuu/ui/custom/notification-code-text';
import { notificationLabelsFrom } from '@tuturuuu/ui/custom/notification-labels';
import { getTranslations } from 'next-intl/server';
import NotificationPopoverClient from './notification-popover-client';

export default async function NotificationPopover({
  userId,
}: {
  userId: string;
}) {
  const t = await getTranslations();

  return (
    <NotificationPopoverClient
      userId={userId}
      labels={notificationLabelsFrom(t)}
      codeText={notificationCodeTextFrom(t)}
    />
  );
}
