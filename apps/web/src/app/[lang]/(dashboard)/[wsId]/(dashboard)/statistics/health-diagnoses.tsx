import StatisticCard from '@/components/cards/StatisticCard';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export default async function HealthDiagnosesStatistics({
  wsId,
}: {
  wsId: string;
}) {
  const supabase = createServerComponentClient({ cookies });

  const enabled = await verifyHasSecrets(wsId, ['ENABLE_HEALTHCARE']);

  const { count: diagnoses } = enabled
    ? await supabase
        .from('healthcare_diagnoses')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  if (!enabled) return null;

  return (
    <StatisticCard
      title="Chẩn đoán"
      value={diagnoses}
      href={`/${wsId}/healthcare/diagnoses`}
    />
  );
}
