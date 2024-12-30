import StatisticCard from '@/components/cards/StatisticCard';
import { createClient } from '@/utils/supabase/server';
import { getTranslations } from 'next-intl/server';

export default async function ExecutionStatistics({
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
        .from('workspace_quizzes')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  if (!enabled) return null;

  return (
    <StatisticCard
      title={t('workspace-ai-layout.executions')}
      value={count}
      href={`/${wsId}/cron/executions`}
      className={className}
    />
  );
}
