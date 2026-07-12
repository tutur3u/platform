'use client';

import { AlertTriangle, Calculator } from '@tuturuuu/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { formatCurrency } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { FinanceDisplayAmount } from '../../shared/finance-display-amount';

interface SubscriptionInvoiceProposalProps {
  billableQuantity?: number | null;
  currency: string;
  currentTotal: number;
  hasSelectedProducts: boolean;
  suggestedTotal: number;
}

export function SubscriptionInvoiceProposal({
  billableQuantity,
  currency,
  currentTotal,
  hasSelectedProducts,
  suggestedTotal,
}: SubscriptionInvoiceProposalProps) {
  const t = useTranslations();
  const totalsDiffer =
    hasSelectedProducts && Math.abs(currentTotal - suggestedTotal) > 0.01;

  return (
    <Card className="overflow-hidden border-dynamic-blue/30 bg-dynamic-blue/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-dynamic-blue/15 text-dynamic-blue">
            <Calculator className="h-4 w-4" />
          </span>
          {t('ws-invoices.invoice_proposal')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between gap-4 rounded-lg border bg-background/80 p-4">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              {t('ws-invoices.suggested_invoice_total')}
            </p>
            {billableQuantity != null && (
              <p className="mt-1 text-muted-foreground text-sm">
                {t('ws-invoices.based_on_billable_quantity', {
                  count: billableQuantity,
                })}
              </p>
            )}
          </div>
          <FinanceDisplayAmount
            className="shrink-0 font-bold text-2xl text-dynamic-blue tabular-nums"
            value={formatCurrency(suggestedTotal, currency)}
          />
        </div>

        {!hasSelectedProducts && (
          <div className="flex items-start gap-2 rounded-lg border border-dynamic-yellow/30 bg-dynamic-yellow/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-yellow" />
            <p className="text-muted-foreground">
              {t('ws-invoices.suggested_total_requires_products')}
            </p>
          </div>
        )}

        {totalsDiffer && (
          <div className="flex items-start gap-2 rounded-lg border border-dynamic-yellow/30 bg-dynamic-yellow/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-yellow" />
            <p className="text-muted-foreground">
              {t('ws-invoices.suggested_total_mismatch', {
                current: formatCurrency(currentTotal, currency),
                suggested: formatCurrency(suggestedTotal, currency),
              })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
