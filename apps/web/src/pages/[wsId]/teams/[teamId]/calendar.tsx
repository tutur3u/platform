import { useRouter } from 'next/router';
import React, { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { useSegments } from '../../../../hooks/useSegments';
import HeaderX from '../../../../components/metadata/HeaderX';
import { Divider } from '@mantine/core';

const TeamCalendarPage = () => {
  const router = useRouter();
  const { wsId, teamId } = router.query;

  const { data: team } = useSWR(
    wsId && teamId ? `/api/workspaces/${wsId}/teams/${teamId}` : null
  );

  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment(
      team?.workspaces?.id
        ? [
            {
              content: team?.workspaces?.name || 'Unnamed Workspace',
              href: `/workspaces/${team.workspaces.id}`,
            },
            {
              content: 'Teams',
              href: `/workspaces/${team?.workspaces?.id}/teams`,
            },
            {
              content: team?.name || 'Untitled Team',
              href: `/teams/${teamId}`,
            },
            { content: 'Calendar', href: `/teams/${teamId}/calendar` },
          ]
        : []
    );
  }, [
    setRootSegment,
    teamId,
    team?.workspaces?.id,
    team?.workspaces?.name,
    team?.name,
  ]);

  return (
    <div className="pb-20">
      <HeaderX label={`Calendar – ${team?.name || 'Untitled Team'}`} />

      {teamId && (
        <>
          <div className="rounded-lg bg-zinc-900 p-4">
            <h1 className="text-2xl font-bold">Calendar</h1>
            <p className="text-zinc-400">
              Organize tasks, events, and deadlines effectively and
              collaboratively with a calendar.
            </p>
          </div>
          <Divider className="my-4" />
        </>
      )}
    </div>
  );
};

TeamCalendarPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="team">{page}</NestedLayout>;
};

export default TeamCalendarPage;
