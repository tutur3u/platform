'use client';

import { notificationCodeTextFrom } from '@tuturuuu/ui/custom/notification-code-text';
import { notificationLabelsFrom } from '@tuturuuu/ui/custom/notification-labels';
import NotificationPopoverClient from '@tuturuuu/ui/custom/notification-popover-client';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

/**
 * Client counterpart of `notification-popover` for satellites rendered
 * without React Server Components (TanStack Start). Labels come from the
 * client intl provider; the actor is supplied by the page model.
 */
export default function NotificationPopoverView({
  userId,
  hostApp,
  webAppUrl,
}: {
  userId?: string;
  hostApp?: 'mail';
  webAppUrl: string;
}) {
  const t = useTranslations();
  const labels = useMemo(() => notificationLabelsFrom(t), [t]);
  const codeText = useMemo(() => notificationCodeTextFrom(t), [t]);
  return (
    <NotificationPopoverClient
      hostApp={hostApp}
      userId={userId}
      labels={labels}
      codeText={codeText}
      webAppUrl={webAppUrl}
    />
  );
}
