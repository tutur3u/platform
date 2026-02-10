import { Building2, Crown, Shield, Users } from '@tuturuuu/icons';
import type { WorkspaceOverviewSummary } from '@tuturuuu/types';
import { useTranslations } from 'next-intl';

interface Props {
  summary: WorkspaceOverviewSummary;
}

export default function SummaryCards({ summary }: Props) {
  const t = useTranslations('ws-overview');

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title={t('total_workspaces')}
        value={summary.total_workspaces.toLocaleString()}
        subtext={t('team_personal_split', {
          team: summary.team_workspaces,
          personal: summary.personal_workspaces,
        })}
        icon={<Building2 className="h-5 w-5 text-dynamic-blue" />}
      />
      <StatCard
        title={t('active_subscriptions')}
        value={summary.with_active_subscription.toLocaleString()}
        subtext={t('sub_count_breakdown', {
          zero: summary.with_zero_subscriptions,
          single: summary.with_single_subscription,
          multiple: summary.with_multiple_subscriptions,
        })}
        icon={<Crown className="h-5 w-5 text-dynamic-yellow" />}
      />
      <StatCard
        title={t('avg_members')}
        value={summary.avg_members.toFixed(1)}
        subtext={t('empty_workspaces', { count: summary.empty_workspaces })}
        icon={<Users className="h-5 w-5 text-dynamic-purple" />}
      />
      <StatCard
        title={t('tier_distribution')}
        value={`F:${summary.tier_free} P:${summary.tier_plus} Pr:${summary.tier_pro} E:${summary.tier_enterprise}`}
        subtext=""
        icon={<Shield className="h-5 w-5 text-dynamic-green" />}
      />
    </div>
  );
}

function StatCard({
  title,
  value,
  subtext,
  icon,
}: {
  title: string;
  value: string;
  subtext: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-muted p-2">{icon}</div>
        <div className="flex-1">
          <p className="font-medium text-muted-foreground text-sm">{title}</p>
          <p className="mt-1 font-bold text-2xl">{value}</p>
          {subtext && (
            <p className="text-muted-foreground text-xs">{subtext}</p>
          )}
        </div>
      </div>
    </div>
  );
}
