'use client';

import { useEffect } from 'react';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';
import useTranslation from 'next-translate/useTranslation';
import StatisticCard from '../../../../../components/cards/StatisticCard';
import useSWR from 'swr';

export default function InfrastructureOverviewPage() {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const { t } = useTranslation('infrastructure-tabs');

  const infrastructureLabel = t('infrastructure');
  const overviewLabel = t('overview');
  const usersLabel = t('users');
  const workspacesLabel = t('workspaces');

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: infrastructureLabel, href: `/${ws.id}/infrastructure` },
            { content: overviewLabel, href: `/${ws.id}/infrastructure` },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [infrastructureLabel, overviewLabel, ws, setRootSegment]);

  const usersCountApi = ws?.id ? `/api/users/count` : null;

  const workspacesCountApi = ws?.id ? `/api/workspaces/count` : null;

  const { data: users, error: usersError } = useSWR<number>(usersCountApi);

  const { data: workspaces, error: workspacesError } =
    useSWR<number>(workspacesCountApi);

  const isUsersLoading = users === undefined && !usersError;
  const isWorkspacesLoading = workspaces === undefined && !workspacesError;

  return (
    <div className="grid flex-col gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatisticCard
        title={usersLabel}
        value={users}
        loading={isUsersLoading}
        href={`/${ws?.id}/infrastructure/users`}
      />

      <StatisticCard
        title={workspacesLabel}
        value={workspaces}
        loading={isWorkspacesLoading}
        href={`/${ws?.id}/infrastructure/workspaces`}
      />
    </div>
  );
}
