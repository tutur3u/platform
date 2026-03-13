'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import NotificationPopoverClientBase from '@tuturuuu/ui/custom/notification-popover-client';
import { type ComponentProps, useState } from 'react';
import { makeQueryClient } from '@/trpc/query';

type NotificationPopoverClientProps = ComponentProps<
  typeof NotificationPopoverClientBase
>;

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
