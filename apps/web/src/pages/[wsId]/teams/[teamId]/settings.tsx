import { Divider, TextInput } from '@mantine/core';
import moment from 'moment';
import { useRouter } from 'next/router';
import { ReactElement, useEffect, useState } from 'react';
import useSWR, { mutate } from 'swr';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { useSegments } from '../../../../hooks/useSegments';
import HeaderX from '../../../../components/metadata/HeaderX';
import { Team } from '../../../../types/primitives/Team';
import { openModal } from '@mantine/modals';
import TeamDeleteForm from '../../../../components/forms/TeamDeleteForm';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';

const TeamSettingsPage = () => {
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
              content: ws.name || 'Unnamed Workspace',
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
              content: 'Settings',
              href: `/${ws.id}/teams/${teamId}/settings`,
            },
          ]
        : []
    );
  }, [setRootSegment, ws, teamId, team?.name]);

  const showDeleteTeamModal = async (team: Team) => {
    openModal({
      title: <div className="font-semibold">Are you absolutely sure?</div>,
      centered: true,
      children: <TeamDeleteForm team={team} onDelete={handleDelete} />,
    });
  };

  const [name, setName] = useState<string | undefined>(team?.name);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);

    if (!team || !ws) {
      setIsSaving(false);
      throw new Error('Failed to save team');
    }

    const res = await fetch(`/api/workspaces/${ws.id}/teams/${teamId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
      }),
    });

    if (res.ok) {
      setRootSegment(
        ws
          ? [
              {
                content: ws.name || 'Unnamed Workspace',
                href: `/workspaces/${ws.id}`,
              },
              {
                content: 'Teams',
                href: `/workspaces/${ws.id}/teams`,
              },
              {
                content: name || 'Untitled Team',
                href: `/teams/${teamId}`,
              },
              { content: 'Settings', href: `/teams/${teamId}/settings` },
            ]
          : []
      );

      mutate(`/api/workspaces/${ws.id}/teams/${teamId}`);
      mutate(`/api/workspaces/${ws.id}/teams`);
    }

    setIsSaving(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);

    if (!team || !ws) {
      setIsDeleting(false);
      throw new Error('Failed to delete team');
    }

    const res = await fetch(`/api/workspaces/${ws.id}/teams/${teamId}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      router.push(`/${team.workspaces.id}/teams`);
      mutate(`/api/workspaces/${team.workspaces.id}/teams`);
    }
  };

  return (
    <>
      <HeaderX label={`Settings – ${team?.name || 'Untitled Team'}`} />

      {teamId && (
        <>
          <div className="rounded-lg bg-zinc-900 p-4">
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-zinc-400">Manage the settings of your team.</p>
          </div>
        </>
      )}

      <Divider className="my-4" />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
          <div className="mb-1 text-3xl font-bold">Basic Information</div>
          <div className="mb-4 font-semibold text-zinc-500">
            Manage the basic information of your team.
          </div>

          <div className="grid max-w-xs gap-2">
            <TextInput
              label="Name"
              placeholder={team?.name || name || 'Untitled Team'}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </div>

          {team?.created_at && (
            <div className="mt-8 border-t border-zinc-700/70 pt-4 text-zinc-500">
              This team was created{' '}
              <span className="font-semibold text-zinc-300">
                {moment(team.created_at).fromNow()}
              </span>
              .
            </div>
          )}

          <div className="h-full" />

          <button
            onClick={isSaving || name === team?.name ? undefined : handleSave}
            className={`${
              isSaving || name === team?.name
                ? 'cursor-not-allowed opacity-50'
                : 'hover:border-blue-300/30 hover:bg-blue-300/20'
            } col-span-full mt-8 flex w-full items-center justify-center rounded-lg border border-blue-300/20 bg-blue-300/10 p-2 text-xl font-semibold text-blue-300 transition`}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>

        <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
          <div className="mb-1 text-3xl font-bold">Security</div>
          <div className="mb-4 font-semibold text-zinc-500">
            Manage the security of your team.
          </div>

          <div className="grid h-full items-end gap-4 text-center xl:grid-cols-2">
            <div
              className="col-span-full flex h-fit w-full cursor-pointer items-center justify-center rounded-lg border border-red-300/20 bg-red-300/10 p-2 text-xl font-semibold text-red-300 transition duration-300 hover:border-red-300/30 hover:bg-red-300/20"
              onClick={() => showDeleteTeamModal(team)}
            >
              {isDeleting ? 'Deleting...' : 'Delete Team'}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

TeamSettingsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="team">{page}</NestedLayout>;
};

export default TeamSettingsPage;
