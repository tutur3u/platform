import StatisticCard from '@/components/cards/StatisticCard';
import { createClient } from '@/utils/supabase/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function HealthcareOverviewPage({ params }: Props) {
  const supabase = await createClient();
  const { wsId } = await params;

  const { count: checkups } = await supabase
    .from('healthcare_checkups')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const { count: diagnoses } = await supabase
    .from('healthcare_diagnoses')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const { count: vitals } = await supabase
    .from('healthcare_vitals')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const { count: groups } = await supabase
    .from('healthcare_vital_groups')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  return (
    <div className="flex min-h-full w-full flex-col">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatisticCard
          title="Kiểm tra sức khoẻ"
          value={checkups}
          href={`/${wsId}/healthcare/checkups`}
        />

        <StatisticCard
          title="Chẩn đoán"
          value={diagnoses}
          href={`/${wsId}/healthcare/diagnoses`}
        />

        <StatisticCard
          title="Chỉ số"
          value={vitals}
          href={`/${wsId}/healthcare/vitals`}
        />

        <StatisticCard
          title="Nhóm chỉ số"
          value={groups}
          href={`/${wsId}/healthcare/vital-groups`}
        />
      </div>
    </div>
  );
}
