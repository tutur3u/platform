'use client';

import { useTranslations } from 'use-intl';
import type { AiAgentsData } from './ai-agents-utils';

export function AiAgentsSummary({ data }: { data: AiAgentsData }) {
  const t = useTranslations('ai-agents-settings');

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <SummaryMetric label={t('summary.agents')} value={data.agents.length} />
      <SummaryMetric
        label={t('summary.channels')}
        value={data.agents.reduce(
          (total, agent) => total + agent.channels.length,
          0
        )}
      />
      <SummaryMetric
        label={t('summary.deployed')}
        value={data.agents.reduce(
          (total, agent) =>
            total +
            agent.channels.filter((channel) => channel.status === 'deployed')
              .length,
          0
        )}
      />
      <SummaryMetric
        label={t('summary.identities')}
        value={data.identities.length}
      />
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className="font-semibold text-2xl">{value}</div>
    </div>
  );
}
