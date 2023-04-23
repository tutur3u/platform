import { SquaresPlusIcon } from '@heroicons/react/24/solid';
import { openModal } from '@mantine/modals';
import { showNotification } from '@mantine/notifications';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import { mutate } from 'swr';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useSegments } from '../../../hooks/useSegments';
import { Team } from '../../../types/primitives/Team';
import moment from 'moment';
import TeamEditForm from '../../../components/forms/TeamEditForm';
import HeaderX from '../../../components/metadata/HeaderX';
import { Divider } from '@mantine/core';
import { useWorkspaces } from '../../../hooks/useWorkspaces';

const WorkspaceTeamsPage = () => {
  const router = useRouter();
  const { wsId } = router.query;

  const { ws, teams } = useWorkspaces();

  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment(
      wsId
        ? [
            {
              content: ws?.name ?? 'Loading...',
              href: `/${wsId}`,
            },
            {
              content: 'Teams',
              href: `/${wsId}/teams`,
            },
          ]
        : []
    );
  }, [setRootSegment, wsId, ws?.name]);

  const createTeam = async (wsId: string, team: Partial<Team>) => {
    const res = await fetch(`/api/workspaces/${wsId}/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(team),
    });

    if (res.status === 200) {
      mutate(`/api/workspaces/${wsId}/teams`);
      showNotification({
        title: 'Team created',
        color: 'teal',
        message: `Team ${team.name} created successfully`,
      });

      const data = await res.json();
      router.push(`/${wsId}/teams/${data.id}`);
    } else {
      showNotification({
        title: 'Error',
        color: 'red',
        message: `Team ${team.name} could not be created`,
      });
    }
  };

  const showTeamEditForm = () => {
    openModal({
      title: <div className="font-semibold">Create new team</div>,
      centered: true,
      children: (
        <TeamEditForm onSubmit={(team) => createTeam(wsId as string, team)} />
      ),
    });
  };

  return (
    <div className="pb-20">
      <HeaderX label={`Teams – ${ws?.name || 'Unnamed Workspace'}`} />

      {wsId && (
        <>
          <div className="rounded-lg bg-zinc-900 p-4">
            <h1 className="text-2xl font-bold">
              Teams{' '}
              <span className="rounded-lg bg-purple-300/20 px-2 text-lg text-purple-300">
                {teams?.length || 0}
              </span>
            </h1>
            <p className="text-zinc-400">
              Organize work into teams and track progress with ease.
            </p>
          </div>
          <Divider className="my-4" />
        </>
      )}

      {wsId && (
        <button
          onClick={showTeamEditForm}
          className="flex items-center gap-1 rounded bg-blue-300/20 px-4 py-2 font-semibold text-blue-300 transition hover:bg-blue-300/10"
        >
          New team <SquaresPlusIcon className="h-4 w-4" />
        </button>
      )}

      <div className="mt-4 grid gap-4">
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {teams?.map((team) => (
            <Link
              key={team.id}
              href={`/${wsId}/teams/${team.id}`}
              className="group rounded-lg border border-zinc-800/80 bg-[#19191d] p-4 transition hover:bg-[#232327]"
            >
              <h1 className="font-bold">{team?.name || 'Untitled Team'}</h1>

              {team?.created_at ? (
                <>
                  <Divider className="mb-2 mt-8" variant="dashed" />
                  <div className="w-fit rounded-lg border border-blue-300/20 bg-blue-300/10 px-4 py-2 text-blue-300/50 transition group-hover:border-transparent">
                    Started{' '}
                    <span className="font-semibold text-blue-300">
                      {moment(team.created_at).fromNow()}
                    </span>
                  </div>
                </>
              ) : null}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

WorkspaceTeamsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="workspace">{page}</NestedLayout>;
};

export default WorkspaceTeamsPage;
