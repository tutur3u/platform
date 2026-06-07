'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import type NotificationPopoverClientBaseType from '@tuturuuu/ui/custom/notification-popover-client';
import dynamic from 'next/dynamic';
import { type ComponentProps, useState } from 'react';
import { makeQueryClient } from '@/trpc/query';

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
  const [queryClient] = useState(() => makeQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <NotificationPopoverClientBase {...props} />
    </QueryClientProvider>
  );
}
