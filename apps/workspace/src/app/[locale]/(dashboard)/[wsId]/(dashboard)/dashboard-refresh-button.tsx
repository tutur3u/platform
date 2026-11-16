'use client';

import { RefreshCw } from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

/** Re-renders the server cards of the current route in place. */
export function DashboardRefreshButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RefreshCw
        aria-hidden
        className={pending ? 'motion-safe:animate-spin' : undefined}
      />
      {label}
    </Button>
  );
}
