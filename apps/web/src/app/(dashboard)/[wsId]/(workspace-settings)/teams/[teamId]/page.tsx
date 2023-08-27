'use client';

import useSWR from 'swr';
import { Divider } from '@mantine/core';

interface Props {
  params: {
    wsId: string;
    teamId: string;
  };
}

export default function TeamOverviewPage({ params: { wsId, teamId } }: Props) {
  const { data: team } = useSWR(
    wsId && teamId ? `/api/workspaces/${wsId}/teams/${teamId}` : null
  );

  return (
    <>
      {teamId && (
        <>
          <div className="rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900">
            <h1 className="text-2xl font-bold">Overview</h1>
            <p className="text-zinc-700 dark:text-zinc-400">
              A quick summary of the{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {team?.name || 'Untitled Team'}
              </span>{' '}
              team and its progress.
            </p>
          </div>
          <Divider className="my-4" />
        </>
      )}
    </>
  );
}
