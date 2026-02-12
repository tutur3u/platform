'use client';

import { AlertCircle, Loader2 } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';

interface ErrorDisplayProps {
  error: string;
}

export function ErrorDisplay({ error }: ErrorDisplayProps) {
  const t = useTranslations('time-tracker.management.errors');

  return (
    <div className="overflow-hidden rounded-xl border border-dynamic-red/20 bg-linear-to-r from-dynamic-red/10 to-dynamic-orange/10 p-6 transition-all duration-300">
      <div className="flex items-center gap-4">
        <div className="rounded-lg bg-dynamic-red/20 p-2 ring-2 ring-dynamic-red/10">
          <AlertCircle className="size-5 text-dynamic-red" />
        </div>
        <div>
          <h4 className="font-semibold text-base text-dynamic-red">
            {t('errorLoadingData')}
          </h4>
          <p className="mt-1 text-dynamic-red/80 text-sm">{error}</p>
        </div>
      </div>
    </div>
  );
}

export function LoadingOverlay() {
  const t = useTranslations('time-tracker.management.errors');

  return (
    <div className="overflow-hidden rounded-xl border border-dynamic-blue/20 bg-linear-to-r from-dynamic-blue/10 to-dynamic-purple/10 p-6 transition-all duration-300">
      <div className="flex items-center gap-4">
        <div className="rounded-lg bg-dynamic-blue/20 p-2 ring-2 ring-dynamic-blue/10">
          <Loader2 className="size-5 animate-spin text-dynamic-blue" />
        </div>
        <div>
          <span className="font-medium text-base text-dynamic-blue">
            {t('applyingFilters')}
          </span>
          <p className="mt-1 text-dynamic-blue/80 text-sm">{t('pleaseWait')}</p>
        </div>
      </div>
    </div>
  );
}
