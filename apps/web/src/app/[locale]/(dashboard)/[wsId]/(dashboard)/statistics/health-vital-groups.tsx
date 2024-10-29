import StatisticCard from '@/components/cards/StatisticCard';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { createClient } from '@/utils/supabase/server';

export default async function HealthVitalGroupsStatistics({
  wsId,
}: {
  wsId: string;
}) {
  const supabase = await createClient();

  const enabled = await verifyHasSecrets(wsId, ['ENABLE_HEALTHCARE']);

  const { count: groups } = enabled
    ? await supabase
        .from('healthcare_vital_groups')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  if (!enabled) return null;

  return (
    <StatisticCard
      title="Nhóm chỉ số"
      value={groups}
      href={`/${wsId}/healthcare/vital-groups`}
    />
  );
}
