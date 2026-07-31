import {
  Activity,
  CheckCircle2,
  Clock3,
  Coins,
  Cpu,
  DollarSign,
} from '@tuturuuu/icons';
import { getTranslations } from 'next-intl/server';
import type { AiStudioOverview } from '@/lib/studio-data';
import { StatCard, StatCardGrid } from '../studio/stat-card';
import { StudioErrorState } from '../studio/states';
import { OverviewActivity } from './overview-activity';
import { OverviewSidebar } from './overview-sidebar';
import { OverviewTrend } from './overview-trend';

export async function OverviewPanel({
  canManageAiKeys,
  canManageAiPolicy,
  data,
  workspaceId,
}: {
  canManageAiKeys: boolean;
  canManageAiPolicy: boolean;
  data: AiStudioOverview | null;
  workspaceId: string;
}) {
  const t = await getTranslations('ai-studio');
  const home = await getTranslations('ai-studio.home');
  const observability = await getTranslations('ai-studio.observability');

  if (!data) {
    return (
      <StudioErrorState
        description={home('unavailable_description')}
        retryLabel={observability('retry')}
        title={home('unavailable')}
      />
    );
  }

  const now = Date.now();
  const activeKeys = data.keys.filter(
    (key) =>
      !key.revoked_at &&
      (!key.expires_at || new Date(key.expires_at).getTime() > now)
  ).length;
  const { totals } = data;
  const successRate = totals.requestCount
    ? (totals.succeededCount / totals.requestCount) * 100
    : null;

  return (
    <div className="space-y-4">
      <StatCardGrid>
        <StatCard
          href={`/${workspaceId}/runs`}
          icon={Activity}
          label={observability('requests')}
          tone="blue"
          value={totals.requestCount.toLocaleString()}
        />
        <StatCard
          hint={home('succeeded_of', {
            succeeded: totals.succeededCount.toLocaleString(),
            total: totals.requestCount.toLocaleString(),
          })}
          icon={CheckCircle2}
          label={home('success_rate')}
          tone="green"
          value={
            successRate === null
              ? '—'
              : `${successRate.toFixed(successRate >= 99.95 ? 0 : 1)}%`
          }
        />
        <StatCard
          href={`/${workspaceId}/credits`}
          icon={Coins}
          label={observability('billed_credits')}
          tone="purple"
          value={totals.billedCredits.toLocaleString(undefined, {
            maximumFractionDigits: 4,
          })}
        />
        <StatCard
          href={`/${workspaceId}/usage`}
          icon={DollarSign}
          label={observability('provider_cost')}
          tone="orange"
          value={`$${totals.providerCostUsd.toLocaleString(undefined, {
            maximumFractionDigits: 4,
            minimumFractionDigits: 2,
          })}`}
        />
        <StatCard
          icon={Clock3}
          label={observability('average_latency')}
          value={
            totals.latencySampleCount
              ? `${Math.round(totals.averageLatencyMs).toLocaleString()} ms`
              : '—'
          }
        />
        <StatCard
          href={`/${workspaceId}/usage`}
          icon={Cpu}
          label={t('active-models')}
          value={data.models.length.toLocaleString()}
        />
      </StatCardGrid>

      <OverviewTrend daily={data.daily} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.45fr)]">
        <OverviewActivity runs={data.runs} workspaceId={workspaceId} />
        <OverviewSidebar
          activeKeys={activeKeys}
          canManageAiKeys={canManageAiKeys}
          canManageAiPolicy={canManageAiPolicy}
          totals={totals}
          workspaceId={workspaceId}
        />
      </div>
    </div>
  );
}
