'use client';

import type NotificationPopoverClientBaseType from '@tuturuuu/ui/custom/notification-popover-client';
import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';

type NotificationPopoverClientProps = ComponentProps<
  typeof NotificationPopoverClientBaseType
>;

const NotificationPopoverClientBase = dynamic(
  () => import('@tuturuuu/ui/custom/notification-popover-client'),
  {
    loading: () => (
      <div className="h-10 w-10 animate-pulse rounded-lg bg-foreground/5" />
    ),
    ssr: false,
  }
);

export default function NotificationPopoverClient(
  props: NotificationPopoverClientProps
) {
  return <NotificationPopoverClientBase {...props} />;
}
