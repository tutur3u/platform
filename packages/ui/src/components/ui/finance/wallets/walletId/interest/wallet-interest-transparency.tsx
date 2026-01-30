'use client';

import { Calculator, Clock, HelpCircle, History } from '@tuturuuu/icons';
import type {
  WalletInterestProvider,
  WalletInterestRate,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { useCurrencyFormatter } from '@tuturuuu/ui/hooks/use-currency-formatter';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface WalletInterestTransparencyProps {
  rate: number;
  rateHistory: WalletInterestRate[];
  provider: WalletInterestProvider;
  currency: string;
}

/**
 * Transparency panel showing calculation details for user trust.
 * Includes formula explanation, business day rules, and rate history timeline.
 */
export function WalletInterestTransparency({
  rate,
  rateHistory,
  provider,
  currency,
}: WalletInterestTransparencyProps) {
  const t = useTranslations('wallet-interest');
  const { formatDate } = useCurrencyFormatter({ currency });
  const [isOpen, setIsOpen] = useState(false);

  const providerName = provider === 'momo' ? 'Momo' : 'ZaloPay';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <HelpCircle className="h-4 w-4" />
          {t('how_calculated')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Formula Section */}
        <div className="rounded-lg bg-muted/50 p-4">
          <div className="mb-2 flex items-center gap-2 font-medium text-sm">
            <Calculator className="h-4 w-4 text-muted-foreground" />
            {t('calculation_formula_title')}
          </div>
          <code className="block rounded bg-background px-3 py-2 font-mono text-sm">
            {t('calculation_formula', { rate: rate.toFixed(2) })}
          </code>
          <p className="mt-2 text-muted-foreground text-xs">
            {t('formula_explanation', { provider: providerName })}
          </p>
        </div>

        {/* Business Day Rules */}
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-muted/50 p-3 font-medium text-sm hover:bg-muted/70">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {t('business_day_rules')}
            </div>
            <Badge variant="outline" className="text-xs">
              {isOpen ? t('hide') : t('show')}
            </Badge>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <ul className="space-y-2 rounded-lg bg-muted/30 p-3 text-sm">
              <RuleItem
                icon="1"
                title={t('rule_weekday_title')}
                description={t('rule_weekday')}
              />
              <RuleItem
                icon="2"
                title={t('rule_weekend_title')}
                description={t('rule_weekend')}
              />
              <RuleItem
                icon="3"
                title={t('rule_holiday_title')}
                description={t('rule_holiday')}
              />
            </ul>
          </CollapsibleContent>
        </Collapsible>

        {/* Rate History Timeline */}
        {rateHistory.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2 font-medium text-sm">
              <History className="h-4 w-4 text-muted-foreground" />
              {t('rate_history')}
            </div>
            <div className="max-h-40 space-y-2 overflow-y-auto">
              {rateHistory.slice(0, 5).map((rateItem) => {
                const isCurrent = !rateItem.effective_to;
                return (
                  <div
                    key={rateItem.id}
                    className="flex items-center gap-3 text-sm"
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        isCurrent ? 'bg-primary' : 'bg-muted-foreground/50'
                      }`}
                    />
                    <span
                      className={`font-medium ${isCurrent ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                      {rateItem.annual_rate}%
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {formatDate(rateItem.effective_from, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                      {rateItem.effective_to &&
                        ` - ${formatDate(rateItem.effective_to, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}`}
                    </span>
                    {isCurrent && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {t('current')}
                      </Badge>
                    )}
                  </div>
                );
              })}
              {rateHistory.length > 5 && (
                <p className="text-center text-muted-foreground text-xs">
                  +{rateHistory.length - 5} {t('more_rates')}
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RuleItem({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary text-xs">
        {icon}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
    </li>
  );
}
