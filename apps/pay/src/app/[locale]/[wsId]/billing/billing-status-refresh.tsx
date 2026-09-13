'use client';

import { Button } from '@tuturuuu/ui/button';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

/** Re-read server billing data without repeating a provider mutation. */
export function BillingStatusRefresh() {
  const router = useRouter();
  const t = useTranslations('billing');
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {t('refresh-billing-status')}
    </Button>
  );
}
