import StatisticCard from '@/components/cards/StatisticCard';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { createClient } from '@/utils/supabase/server';

export default async function HealthVitalsStatistics({
  wsId,
}: {
  wsId: string;
}) {
  const supabase = await createClient();

  const enabled = await verifyHasSecrets(wsId, ['ENABLE_HEALTHCARE']);

  const { count: vitals } = enabled
    ? await supabase
        .from('healthcare_vitals')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  if (!enabled) return null;

  return (
    <StatisticCard
      title="Chỉ số"
      value={vitals}
      href={`/${wsId}/healthcare/vitals`}
    />
  );
}
