'use client';

import { SquaresPlusIcon } from '@heroicons/react/24/solid';
import { openModal } from '@mantine/modals';
import { showNotification } from '@mantine/notifications';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ReactElement } from 'react';
import { mutate } from 'swr';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import { Team } from '../../../../../types/primitives/Team';
import moment from 'moment';
import TeamEditForm from '../../../../../components/forms/TeamEditForm';
import { Divider } from '@mantine/core';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';
import useTranslation from 'next-translate/useTranslation';
import 'moment/locale/vi';

interface Props {
  params: {
    wsId: string;
  };
}

const WorkspaceTeamsPage = ({ params: { wsId } }: Props) => {
  const { t, lang } = useTranslation('ws-teams');

  const teamsLabel = t('workspace-tabs:teams');

  const router = useRouter();
  const { teams } = useWorkspaces();

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
        title: t('team_created'),
        color: 'teal',
        message: `${t('team')} ${team.name} ${t('created_successfully')}`,
      });

      const data = await res.json();
      router.push(`/${wsId}/teams/${data.id}`);
    } else {
      showNotification({
        title: t('error_creating_team'),
        color: 'red',
        message: `${t('team')} ${team.name} ${t('could_not_create')}`,
      });
    }
  };

  const showTeamEditForm = () => {
    openModal({
      title: <div className="font-semibold">{t('new_team')}</div>,
      centered: true,
      children: (
        <TeamEditForm onSubmit={(team) => createTeam(wsId as string, team)} />
      ),
    });
  };

  return (
    <>
      {wsId && (
        <>
          <div className="rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900">
            <h1 className="text-2xl font-bold">
              {teamsLabel}{' '}
              <span className="rounded-lg bg-purple-300/20 px-2 text-lg text-purple-300">
                {teams?.length || 0}
              </span>
            </h1>
            <p className="text-zinc-700 dark:text-zinc-400">
              {t('description')}
            </p>
          </div>
          <Divider className="my-4" />
        </>
      )}

      {wsId && (
        <button
          onClick={showTeamEditForm}
          className="flex items-center gap-1 rounded bg-blue-500/10 px-4 py-2 font-semibold text-blue-500 transition hover:bg-blue-500/20 dark:bg-blue-300/20 dark:text-blue-300 dark:hover:bg-blue-300/10"
        >
          {t('new_team')} <SquaresPlusIcon className="h-4 w-4" />
        </button>
      )}

      <div className="mt-4 grid gap-4">
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {teams?.map((team) => (
            <Link
              key={team.id}
              href={`/${wsId}/teams/${team.id}`}
              className="group rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 transition hover:bg-zinc-500/10 dark:border-zinc-800/80 dark:bg-zinc-900 dark:hover:bg-[#232327]"
            >
              <h1 className="font-bold">{team?.name}</h1>

              {team?.created_at ? (
                <>
                  <Divider className="mb-2 mt-8" variant="dashed" />
                  <div className="w-fit rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-blue-600/80 transition group-hover:border-transparent dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-300/50">
                    {t('created')}{' '}
                    <span className="font-semibold text-blue-600 dark:text-blue-300">
                      {moment(team.created_at).locale(lang).fromNow()}
                    </span>
                  </div>
                </>
              ) : null}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
};

WorkspaceTeamsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="workspace">{page}</NestedLayout>;
};

export default WorkspaceTeamsPage;
