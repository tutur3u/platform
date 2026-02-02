'use client';

import { Calendar, ChevronDown, Clock, TrendingUp } from '@tuturuuu/icons';
import type { InterestSummary } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { useCurrencyFormatter } from '@tuturuuu/ui/hooks/use-currency-formatter';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

interface WalletInterestHeroProps {
  summary: InterestSummary;
  currency: string;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Always-visible hero summary card showing key interest metrics at a glance.
 * Displays total earned, current rate, and quick stats (today/MTD/YTD).
 */
export function WalletInterestHero({
  summary,
  currency,
  expanded,
  onToggle,
}: WalletInterestHeroProps) {
  const t = useTranslations('wallet-interest');
  const { formatCurrency } = useCurrencyFormatter({ currency });

  const rate = summary.currentRate?.annual_rate ?? 0;

  return (
    <Card className="overflow-hidden border-primary/20 bg-linear-to-r from-primary/5 via-primary/3 to-background">
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* Left: Total Earned + Rate */}
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-muted-foreground text-sm">
                {t('total_interest_earned')}
              </p>
              <p className="font-bold text-2xl text-primary md:text-3xl">
                {formatCurrency(summary.totalEarnedInterest)}
              </p>
              <Badge variant="secondary" className="mt-1">
                {rate}% {t('annual_rate').toLowerCase()}
              </Badge>
            </div>
          </div>

          {/* Center: Quick Stats Row */}
          <div className="flex flex-1 justify-center gap-4 border-foreground/10 md:gap-6 md:border-x md:px-6">
            <QuickStat
              label={t('today_interest')}
              value={formatCurrency(summary.todayInterest)}
              icon={<Clock className="h-4 w-4" />}
            />
            <QuickStat
              label={t('mtd_interest')}
              value={formatCurrency(summary.monthToDateInterest)}
              icon={<Calendar className="h-4 w-4" />}
            />
            <QuickStat
              label={t('ytd_interest')}
              value={formatCurrency(summary.yearToDateInterest)}
              icon={<TrendingUp className="h-4 w-4" />}
            />
          </div>

          {/* Right: Expand Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="shrink-0 self-center"
            aria-label={expanded ? t('collapse_details') : t('expand_details')}
          >
            <ChevronDown
              className={cn(
                'h-5 w-5 transition-transform duration-200',
                expanded && 'rotate-180'
              )}
            />
          </Button>
        </div>

        {/* Estimated Interest Row (compact) */}
        <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2">
          <span className="text-muted-foreground text-sm">
            {t('estimated_interest')}
          </span>
          <div className="flex gap-4 text-sm">
            <span>
              <span className="text-muted-foreground">{t('daily_avg')}:</span>{' '}
              <span className="font-medium">
                {formatCurrency(summary.averageDailyInterest)}
              </span>
            </span>
            <span className="hidden sm:inline">
              <span className="text-muted-foreground">{t('monthly_est')}:</span>{' '}
              <span className="font-medium">
                {formatCurrency(summary.estimatedMonthlyInterest)}
              </span>
            </span>
            <span className="hidden md:inline">
              <span className="text-muted-foreground">{t('yearly_est')}:</span>{' '}
              <span className="font-medium">
                {formatCurrency(summary.estimatedYearlyInterest)}
              </span>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="text-center">
      <div className="mb-1 flex items-center justify-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="font-semibold text-lg">{value}</p>
    </div>
  );
}
