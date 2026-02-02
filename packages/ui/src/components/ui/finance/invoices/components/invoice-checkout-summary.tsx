'use client';

import { ArrowDown, ArrowUp } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { formatCurrency } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

interface InvoiceCheckoutSummaryProps {
  subtotal: number;
  totalBeforeRounding: number;
  roundedTotal: number;
  discountAmount?: number;
  discountLabel?: string | null;
  discountClassName?: string;
  onRoundUp: () => void;
  onRoundDown: () => void;
  onResetRounding: () => void;
  showRoundingControls?: boolean;
  roundingDisabled?: boolean;
  currency?: string;
  currencyLocale?: string;
}

export function InvoiceCheckoutSummary({
  subtotal,
  totalBeforeRounding,
  roundedTotal,
  discountAmount,
  discountLabel,
  discountClassName = 'text-dynamic-green',
  onRoundUp,
  onRoundDown,
  onResetRounding,
  showRoundingControls = true,
  roundingDisabled = false,
  currency = 'VND',
  currencyLocale = 'vi-VN',
}: InvoiceCheckoutSummaryProps) {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {t('ws-invoices.subtotal')}
          </span>
          <span>{formatCurrency(subtotal, currencyLocale, currency)}</span>
        </div>

        {discountAmount !== undefined && discountLabel && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t('ws-invoices.discount')} ({discountLabel})
            </span>
            <span className={discountClassName}>
              -{formatCurrency(discountAmount, currencyLocale, currency)}
            </span>
          </div>
        )}

        <Separator />

        <div className="flex justify-between font-semibold">
          <span>{t('ws-invoices.total')}</span>
          <span>{formatCurrency(roundedTotal, currencyLocale, currency)}</span>
        </div>

        {Math.abs(roundedTotal - totalBeforeRounding) > 0.01 && (
          <div className="flex justify-between text-muted-foreground text-sm">
            <span>{t('ws-invoices.adjustment')}</span>
            <span>
              {roundedTotal > totalBeforeRounding ? '+' : ''}
              {formatCurrency(
                roundedTotal - totalBeforeRounding,
                currencyLocale,
                currency
              )}
            </span>
          </div>
        )}
      </div>

      {showRoundingControls && (
        <div className="space-y-2">
          <Label>{t('ws-invoices.rounding_options')}</Label>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRoundUp}
              className="flex-1"
            >
              <ArrowUp className="mr-1 h-4 w-4" />
              {t('ws-invoices.round_up')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onRoundDown}
              className="flex-1"
            >
              <ArrowDown className="mr-1 h-4 w-4" />
              {t('ws-invoices.round_down')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onResetRounding}
              disabled={roundingDisabled}
            >
              {t('ws-invoices.reset')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
