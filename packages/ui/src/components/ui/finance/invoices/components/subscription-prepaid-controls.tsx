'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { MAX_PREPAID_MONTH_COUNT } from '../utils';

interface SubscriptionPrepaidControlsProps {
  coverageRangeLabel: string;
  onPrepaidMonthCountChange: (monthCount: number) => void;
  prepaidMonthCount: number;
  validUntilLabel: string;
}

const PREPAID_MONTH_OPTIONS = Array.from(
  { length: MAX_PREPAID_MONTH_COUNT },
  (_, index) => index + 1
);

export function SubscriptionPrepaidControls({
  coverageRangeLabel,
  onPrepaidMonthCountChange,
  prepaidMonthCount,
  validUntilLabel,
}: SubscriptionPrepaidControlsProps): React.ReactElement {
  const t = useTranslations();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('ws-invoices.prepaid_months')}</CardTitle>
        <CardDescription>
          {t('ws-invoices.prepaid_months_description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="prepaid-month-count">
            {t('ws-invoices.prepaid_month_count')}
          </Label>
          <Select
            value={String(prepaidMonthCount)}
            onValueChange={(value) => onPrepaidMonthCountChange(Number(value))}
          >
            <SelectTrigger id="prepaid-month-count">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PREPAID_MONTH_OPTIONS.map((monthCount) => (
                <SelectItem key={monthCount} value={String(monthCount)}>
                  {monthCount === 1
                    ? t('ws-invoices.prepaid_month_count_one')
                    : t('ws-invoices.prepaid_month_count_many', {
                        count: monthCount,
                      })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">
              {t('ws-invoices.coverage_range')}
            </span>
            <span className="text-right font-medium">{coverageRangeLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">
              {t('ws-invoices.valid_until')}
            </span>
            <span className="text-right font-medium">{validUntilLabel}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
