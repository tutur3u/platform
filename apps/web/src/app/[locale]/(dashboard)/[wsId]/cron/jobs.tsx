import StatisticCard from '@/components/cards/StatisticCard';
import { createClient } from '@ncthub/supabase/next/server';
import { getTranslations } from 'next-intl/server';

export default async function JobsStatistics({
  wsId,
  className,
}: {
  wsId: string;
  className?: string;
  redirect?: boolean;
}) {
  const supabase = await createClient();
  const t = await getTranslations();

  const enabled = true;

  const { count } = enabled
    ? await supabase
        .from('workspace_cron_jobs')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  if (!enabled) return null;

  return (
    <StatisticCard
      title={t('workspace-ai-layout.jobs')}
      value={count}
      href={`/${wsId}/cron/jobs`}
      className={className}
    />
  );
}
