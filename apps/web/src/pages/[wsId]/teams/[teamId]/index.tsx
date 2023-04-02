import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { useSegments } from '../../../../hooks/useSegments';
import HeaderX from '../../../../components/metadata/HeaderX';
import { Divider } from '@mantine/core';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';

const TeamOverviewPage = () => {
  const router = useRouter();
  const { wsId, teamId } = router.query;

  const { data: team } = useSWR(
    wsId && teamId ? `/api/workspaces/${wsId}/teams/${teamId}` : null
  );

  const { ws } = useWorkspaces();

  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Unnamed Workspace',
              href: `/${ws.id}`,
            },
            {
              content: 'Teams',
              href: `/${ws.id}/teams`,
            },
            {
              content: team?.name || 'Untitled Team',
              href: `/${ws.id}/teams/${teamId}`,
            },
            {
              content: 'Overview',
              href: `/${ws.id}/teams/${teamId}`,
            },
          ]
        : []
    );
  }, [setRootSegment, teamId, wsId, ws, team?.name]);

  return (
    <div className="pb-8">
      <HeaderX label={`Overview – ${team?.name || 'Untitled Team'}`} />

      {teamId && (
        <>
          <div className="rounded-lg bg-zinc-900 p-4">
            <h1 className="text-2xl font-bold">Overview</h1>
            <p className="text-zinc-400">
              A quick summary of the{' '}
              <span className="font-semibold text-zinc-200">
                {team?.name || 'Untitled Team'}
              </span>{' '}
              team and its progress.
            </p>
          </div>
          <Divider className="my-4" />
        </>
      )}
    </div>
  );
};

TeamOverviewPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="team">{page}</NestedLayout>;
};

export default TeamOverviewPage;
