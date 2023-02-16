import { useRouter } from 'next/router';
import React, { ReactElement, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';
import HeaderX from '../../../components/metadata/HeaderX';
import { Divider } from '@mantine/core';
import { PlusIcon } from '@heroicons/react/24/solid';
import { openModal } from '@mantine/modals';
import BoardEditForm from '../../../components/forms/BoardEditForm';
import { TaskBoard } from '../../../types/primitives/TaskBoard';
import { showNotification } from '@mantine/notifications';

const ProjectBoardsPage = () => {
  const router = useRouter();
  const { projectId } = router.query;

  const { data: project } = useSWR(
    projectId ? `/api/projects/${projectId}` : null
  );

  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(
      project?.orgs?.id
        ? [
            {
              content: project?.orgs?.name || 'Unnamed Workspace',
              href: `/orgs/${project.orgs.id}`,
            },
            {
              content: 'Projects',
              href: `/orgs/${project?.orgs?.id}/projects`,
            },
            {
              content: project?.name || 'Untitled Project',
              href: `/projects/${projectId}`,
            },
            { content: 'Boards', href: `/projects/${projectId}/tasks` },
          ]
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, project?.orgs?.id, project?.orgs?.name, project?.name]);

  const createBoard = async (projectId: string, board: Partial<TaskBoard>) => {
    const res = await fetch(`/api/tasks/boards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(board),
    });

    if (res.status === 200) {
      mutate(`/api/tasks/boards`);
      showNotification({
        title: 'Board created',
        color: 'teal',
        message: `Board ${board.name} created successfully`,
      });

      const data = await res.json();
    } else {
      showNotification({
        title: 'Error',
        color: 'red',
        message: `Board ${board.name} could not be created`,
      });
    }
  };

  const showBoardEditForm = () => {
    openModal({
      title: <div className="font-semibold">Create new board</div>,
      centered: true,
      children: (
        <BoardEditForm
          onSubmit={(board) => createBoard(projectId as string, board)}
        />
      ),
    });
  };

  return (
    <>
      <HeaderX label={`Boards – ${project?.name || 'Untitled Project'}`} />

      {projectId && (
        <>
          <div className="rounded-lg bg-zinc-900 p-4">
            <h1 className="text-2xl font-bold">Boards</h1>
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
    </>
  );
};

ProjectBoardsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="project">{page}</NestedLayout>;
};

export default ProjectBoardsPage;
