'use client';

import { Activity, Clock3, Coins, Cpu, DollarSign } from '@tuturuuu/icons';
import type {
  AiStudioCreditStatus,
  AiStudioUsageResponse,
} from '@tuturuuu/internal-api/ai-studio';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';

export function ObservabilitySummary({
  credits,
  isLoading,
  section,
  totals,
}: {
  credits?: AiStudioCreditStatus;
  isLoading: boolean;
  section: 'credits' | 'logs' | 'runs' | 'usage';
  totals?: AiStudioUsageResponse['totals'];
}) {
  const t = useTranslations('ai-studio.observability');
  const metrics = [
    { icon: Activity, label: t('requests'), value: totals?.requestCount },
    { icon: Coins, label: t('billed_credits'), value: totals?.billedCredits },
    {
      icon: DollarSign,
      label: t('provider_cost'),
      value: totals && formatUsd(totals.providerCostUsd),
    },
    {
      icon: Cpu,
      label: t('billable_units'),
      value:
        totals &&
        totals.inputTokens +
          totals.outputTokens +
          totals.reasoningTokens +
          totals.embeddingUnits +
          totals.imageUnits +
          totals.searchUnits,
    },
    {
      icon: Clock3,
      label: t('average_latency'),
      value:
        totals &&
        (totals.latencySampleCount > 0
          ? `${Math.round(totals.averageLatencyMs)} ms`
          : '—'),
    },
    {
      icon: Activity,
      label: t('successful_requests'),
      value: totals?.succeededCount,
    },
  ];

  return (
    <div className="space-y-4">
      {section === 'credits' ? (
        <CreditBalanceCard credits={credits} isLoading={isLoading} />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(({ icon: Icon, label, value }) => (
          <Card className="overflow-hidden" key={label}>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="font-medium text-muted-foreground text-sm">
                {label}
              </CardTitle>
              <div className="rounded-lg border bg-muted/50 p-2">
                <Icon className="size-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="font-semibold text-2xl tabular-nums">
              {isLoading ? (
                <Skeleton className="h-8 w-28" />
              ) : typeof value === 'number' ? (
                value.toLocaleString(undefined, {
                  maximumFractionDigits: 4,
                })
              ) : (
                (value ?? '—')
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CreditBalanceCard({
  credits,
  isLoading,
}: {
  credits?: AiStudioCreditStatus;
  isLoading: boolean;
}) {
  const t = useTranslations('ai-studio.observability');
  const totalPool = credits ? credits.totalAllocated + credits.bonusCredits : 0;
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(10rem,0.5fr))] lg:items-end">
        <div>
          <div className="text-muted-foreground text-sm">
            {t('available_balance')}
          </div>
          {isLoading ? (
            <Skeleton className="mt-3 h-11 w-56" />
          ) : (
            <div className="mt-1 font-semibold text-4xl tabular-nums tracking-tight">
              {(credits?.remaining ?? 0).toLocaleString(undefined, {
                maximumFractionDigits: 3,
              })}
            </div>
          )}
          <Progress
            className="mt-5 h-2"
            value={Math.min(100, Math.max(0, credits?.percentUsed ?? 0))}
          />
          <p className="mt-2 text-muted-foreground text-xs">
            {t('balance_scope', {
              scope:
                credits?.balanceScope === 'workspace'
                  ? t('workspace_scope')
                  : t('personal_scope'),
            })}
          </p>
        </div>
        <CreditDatum
          detail={t('balance_period_total')}
          label={t('credits_consumed')}
          loading={isLoading}
          value={credits?.totalUsed}
        />
        <CreditDatum
          label={t('total_credit_pool')}
          loading={isLoading}
          value={totalPool}
          detail={credits?.tier}
        />
      </div>
    </Card>
  );
}

function CreditDatum({
  detail,
  label,
  loading,
  value,
}: {
  detail?: string;
  label: string;
  loading: boolean;
  value?: number;
}) {
  return (
    <div className="border-t pt-4 lg:border-t-0 lg:border-l lg:pl-6">
      <div className="text-muted-foreground text-sm">{label}</div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-28" />
      ) : (
        <div className="mt-1 font-semibold text-2xl tabular-nums">
          {(value ?? 0).toLocaleString(undefined, {
            maximumFractionDigits: 3,
          })}
        </div>
      )}
      {detail ? (
        <div className="mt-1 text-muted-foreground text-xs">{detail}</div>
      ) : null}
    </div>
  );
}

function formatUsd(value: number) {
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
  })}`;
}
