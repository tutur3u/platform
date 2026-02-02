'use client';

import { History } from '@tuturuuu/icons';
import type { WalletInterestRate } from '@tuturuuu/types';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';

interface WalletInterestRateHistoryProps {
  rates: WalletInterestRate[];
  /** When true, renders without card wrapper (for embedding in parent card) */
  embedded?: boolean;
}

/**
 * Timeline showing rate change history.
 */
export function WalletInterestRateHistory({
  rates,
  embedded = false,
}: WalletInterestRateHistoryProps) {
  const t = useTranslations('wallet-interest');

  if (rates.length === 0) {
    return embedded ? (
      <div className="space-y-2">
        <div className="flex items-center gap-2 font-semibold">
          <History className="h-4 w-4" />
          {t('rate_history')}
        </div>
        <p className="text-muted-foreground text-sm">{t('no_rate_history')}</p>
      </div>
    ) : null;
  }

  const formatDate = (dateStr: string) => {
    return new Intl.DateTimeFormat('vi-VN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(dateStr));
  };

  const historyContent = (
    <div className="space-y-3">
      {rates.map((rate, index) => {
        const isCurrent = !rate.effective_to;

        return (
          <div
            key={rate.id}
            className={`flex items-start gap-3 ${
              isCurrent ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {/* Timeline dot */}
            <div className="flex flex-col items-center">
              <div
                className={`h-3 w-3 rounded-full ${
                  isCurrent ? 'bg-primary' : 'bg-muted-foreground/50'
                }`}
              />
              {index < rates.length - 1 && (
                <div className="h-8 w-0.5 bg-muted" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 pb-2">
              <div className="flex items-baseline justify-between">
                <span
                  className={`font-medium ${isCurrent ? 'text-primary' : ''}`}
                >
                  {rate.annual_rate}%
                </span>
                {isCurrent && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary text-xs">
                    {t('current')}
                  </span>
                )}
              </div>
              <p className="text-xs">
                {formatDate(rate.effective_from)}
                {rate.effective_to && ` - ${formatDate(rate.effective_to)}`}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 font-semibold">
          <History className="h-4 w-4" />
          {t('rate_history')}
        </div>
        {historyContent}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          {t('rate_history')}
        </CardTitle>
      </CardHeader>
      <CardContent>{historyContent}</CardContent>
    </Card>
  );
}
