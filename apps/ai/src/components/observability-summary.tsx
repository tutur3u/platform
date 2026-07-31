'use client';

import {
  Activity,
  CheckCircle2,
  Clock3,
  Coins,
  Cpu,
  DollarSign,
  Wallet,
} from '@tuturuuu/icons';
import type {
  AiStudioCreditStatus,
  AiStudioUsageResponse,
} from '@tuturuuu/internal-api/ai-studio';
import { Progress } from '@tuturuuu/ui/progress';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { SectionCard } from './studio/section-card';
import { StatCard, StatCardGrid } from './studio/stat-card';

export function ObservabilitySummary({
  credits,
  isLoading,
  section,
  totals,
}: {
  credits?: AiStudioCreditStatus;
  isLoading: boolean;
  section: 'credits' | 'runs' | 'usage';
  totals?: AiStudioUsageResponse['totals'];
}) {
  const t = useTranslations('ai-studio.observability');
  const billableUnits = totals
    ? totals.inputTokens +
      totals.outputTokens +
      totals.reasoningTokens +
      totals.embeddingUnits +
      totals.imageUnits +
      totals.searchUnits
    : undefined;

  return (
    <div className="space-y-4">
      {section === 'credits' ? (
        <CreditBalanceCard credits={credits} isLoading={isLoading} />
      ) : null}
      <StatCardGrid>
        <StatCard
          icon={Activity}
          isLoading={isLoading}
          label={t('requests')}
          tone="blue"
          value={formatNumber(totals?.requestCount)}
        />
        <StatCard
          icon={CheckCircle2}
          isLoading={isLoading}
          label={t('successful_requests')}
          tone="green"
          value={formatNumber(totals?.succeededCount)}
        />
        <StatCard
          icon={Coins}
          isLoading={isLoading}
          label={t('billed_credits')}
          tone="purple"
          value={formatNumber(totals?.billedCredits)}
        />
        <StatCard
          icon={DollarSign}
          isLoading={isLoading}
          label={t('provider_cost')}
          tone="orange"
          value={totals ? formatUsd(totals.providerCostUsd) : '—'}
        />
        <StatCard
          icon={Cpu}
          isLoading={isLoading}
          label={t('billable_units')}
          value={formatNumber(billableUnits)}
        />
        <StatCard
          icon={Clock3}
          isLoading={isLoading}
          label={t('average_latency')}
          value={
            totals && totals.latencySampleCount > 0
              ? `${Math.round(totals.averageLatencyMs).toLocaleString()} ms`
              : '—'
          }
        />
      </StatCardGrid>
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
  const percentUsed = Math.min(100, Math.max(0, credits?.percentUsed ?? 0));

  return (
    <SectionCard icon={Wallet} title={t('available_balance')}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(9rem,0.5fr))]">
        <div className="min-w-0">
          {isLoading ? (
            <Skeleton className="h-11 w-52" />
          ) : (
            <div className="font-semibold text-4xl tabular-nums tracking-tight">
              {(credits?.remaining ?? 0).toLocaleString(undefined, {
                maximumFractionDigits: 3,
              })}
            </div>
          )}
          <Progress className="mt-4 h-1.5" value={percentUsed} />
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
          detail={credits?.tier}
          label={t('total_credit_pool')}
          loading={isLoading}
          value={totalPool}
        />
      </div>
    </SectionCard>
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
    <div className="border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
      <div className="font-medium text-muted-foreground text-xs uppercase tracking-[0.06em]">
        {label}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <div className="mt-2 font-semibold text-2xl tabular-nums">
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

function formatNumber(value?: number) {
  return value === undefined
    ? '—'
    : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatUsd(value: number) {
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
  })}`;
}
