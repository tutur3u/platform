'use client';

import StatisticCard from '@/components/cards/StatisticCard';
import useSWR from 'swr';

interface Props {
  params: {
    wsId: string;
  };
}

export default function HealthcareOverviewPage({ params: { wsId } }: Props) {
  const checkupsCountApi = wsId
    ? `/api/workspaces/${wsId}/healthcare/checkups/count`
    : null;

  const diagnosesCountApi = wsId
    ? `/api/workspaces/${wsId}/healthcare/diagnoses/count`
    : null;

  const vitalsCountApi = wsId
    ? `/api/workspaces/${wsId}/healthcare/vitals/count`
    : null;

  const groupsCountApi = wsId
    ? `/api/workspaces/${wsId}/healthcare/vital-groups/count`
    : null;

  const { data: checkups, error: checkupsError } =
    useSWR<number>(checkupsCountApi);
  const { data: diagnoses, error: diagnosesError } =
    useSWR<number>(diagnosesCountApi);
  const { data: vitals, error: vitalsError } = useSWR<number>(vitalsCountApi);
  const { data: groups, error: groupsError } = useSWR<number>(groupsCountApi);

  const isCheckupsLoading = checkups === undefined && !checkupsError;
  const isDiagnosesLoading = diagnoses === undefined && !diagnosesError;
  const isVitalsLoading = vitals === undefined && !vitalsError;
  const isGroupsLoading = groups === undefined && !groupsError;

  return (
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatisticCard
          title="Kiểm tra sức khoẻ"
          color="blue"
          value={checkups}
          href={`/${wsId}/healthcare/checkups`}
          loading={isCheckupsLoading}
        />

        <StatisticCard
          title="Chẩn đoán"
          value={diagnoses}
          href={`/${wsId}/healthcare/diagnoses`}
          loading={isDiagnosesLoading}
        />

        <StatisticCard
          title="Chỉ số"
          value={vitals}
          href={`/${wsId}/healthcare/vitals`}
          loading={isVitalsLoading}
        />

        <StatisticCard
          title="Nhóm chỉ số"
          value={groups}
          href={`/${wsId}/healthcare/vital-groups`}
          loading={isGroupsLoading}
        />
      </div>
    </div>
  );
}
