'use client';

import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

/** Retain the failure notice while the query temporarily clears its error. */
export function InvoiceHistoryRecovery({
  failed,
  fetching,
  retry,
}: {
  failed: boolean;
  fetching: boolean;
  retry: () => Promise<unknown>;
}) {
  const t = useTranslations();
  const owner = useRef(false);
  const [pending, setPending] = useState(false);
  if (!failed && !pending) return null;
  const recover = async () => {
    if (owner.current || fetching) return;
    owner.current = true;
    setPending(true);
    try {
      await retry();
    } finally {
      owner.current = false;
      setPending(false);
    }
  };
  return (
    <div className="space-y-2 py-4" role="alert">
      <p className="text-destructive text-sm">
        {t('ws-invoices.history_load_failed')}
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={pending || fetching}
        onClick={recover}
      >
        {t('common.retry')}
      </Button>
    </div>
  );
}
