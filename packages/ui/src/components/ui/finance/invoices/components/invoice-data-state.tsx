'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

export function InvoiceDataState({
  loading,
  onRetry,
}: {
  loading: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <div
        role={loading ? 'status' : 'alert'}
        className="flex items-center gap-2"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        <p className="text-muted-foreground text-sm">
          {t(loading ? 'ws-invoices.loading' : 'ws-invoices.load_failed')}
        </p>
      </div>
      {!loading && (
        <Button type="button" variant="outline" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
