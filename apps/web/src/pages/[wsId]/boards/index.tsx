import { useRouter } from 'next/router';
import React, { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useSegments } from '../../../hooks/useSegments';
import HeaderX from '../../../components/metadata/HeaderX';
import { Divider } from '@mantine/core';
import { PlusIcon } from '@heroicons/react/24/solid';
import { openModal } from '@mantine/modals';
import BoardEditForm from '../../../components/forms/BoardEditForm';
import { TaskBoard } from '../../../types/primitives/TaskBoard';
import { showNotification } from '@mantine/notifications';
import Link from 'next/link';
import { useWorkspaces } from '../../../hooks/useWorkspaces';

const WorkspaceBoardsPage = () => {
  const router = useRouter();
  const { teamId } = router.query;

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
            { content: 'Boards', href: `/${ws.id}/boards` },
          ]
        : []
    );
  }, [setRootSegment, teamId, ws]);

  const { data: boards } = useSWR<TaskBoard[]>(
    teamId && ws ? `/api/workspaces/${ws.id}/boards` : null
  );

  const createBoard = async ({
    teamId,
    board,
  }: {
    teamId: string;
    board: TaskBoard;
  }) => {
    if (!ws) return;
    const res = await fetch(`/api/workspaces/${ws.id}/boards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: board.name,
      }),
    });

    if (!res.ok) {
      showNotification({
        title: 'Error',
        message: 'An error occurred while creating the document.',
        color: 'red',
      });
      return;
    }

    const { id } = await res.json();
    router.push(`/projects/${teamId}/boards/${id}`);
  };

  const showBoardEditForm = () => {
    openModal({
      title: <div className="font-semibold">Create new board</div>,
      centered: true,
      children: (
        <BoardEditForm
          onSubmit={(board) =>
            teamId && typeof teamId === 'string'
              ? createBoard({ teamId, board })
              : null
          }
        />
      ),
    });
  };

  return (
    <>
      <HeaderX label={`Boards – ${ws?.name || 'Untitled Workspace'}`} />

      {teamId && (
        <>
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900 p-4">
            <h1 className="text-2xl font-bold">
              Boards{' '}
              <span className="rounded-lg bg-purple-300/20 px-2 text-lg text-purple-300">
                {boards?.length || 0}
              </span>
            </h1>
            <p className="text-zinc-400">
              A great way to organize your tasks into different categories and
              easily track their progress.
            </p>
          </div>
        </>
      )}

      <Divider className="my-4" />

      <button
        onClick={showBoardEditForm}
        className="flex items-center gap-1 rounded bg-blue-300/20 px-4 py-2 font-semibold text-blue-300 transition hover:bg-blue-300/10"
      >
        New board <PlusIcon className="h-4 w-4" />
      </button>

      <div className="mb-8 mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {boards &&
          boards?.map((board) => (
            <Link
              href={`/projects/${teamId}/boards/${board.id}`}
              key={board.id}
              className="relative rounded-lg border border-zinc-800/80 bg-zinc-900 p-4 transition hover:bg-zinc-800/80"
            >
              <p className="line-clamp-1 font-semibold lg:text-lg xl:text-xl">
                {board.name || 'Untitled Document'}
              </p>
            </Link>
          ))}
      </div>
    </>
  );
};

WorkspaceBoardsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="workspace">{page}</NestedLayout>;
};

export default WorkspaceBoardsPage;
