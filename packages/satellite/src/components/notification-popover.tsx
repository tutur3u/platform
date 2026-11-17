import { notificationCodeTextFrom } from '@tuturuuu/ui/custom/notification-code-text';
import { notificationLabelsFrom } from '@tuturuuu/ui/custom/notification-labels';
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
  hostApp,
}: {
  userId?: string;
  hostApp?: 'mail';
} = {}) {
  const t = await getTranslations();
  const resolvedUserId = userId ?? (await getSatelliteAppSession())?.sub;
  return (
    <NotificationPopoverClient
      hostApp={hostApp}
      userId={resolvedUserId}
      labels={notificationLabelsFrom(t)}
      codeText={notificationCodeTextFrom(t)}
      webAppUrl={getTtrUrl()}
    />
  );
}
