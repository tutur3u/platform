import { PlusIcon } from '@heroicons/react/24/solid';
import { openModal } from '@mantine/modals';
import { showNotification } from '@mantine/notifications';
import { useRouter } from 'next/router';
import React, { ReactElement, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import BoardEditForm from '../../../../components/forms/BoardEditForm';
import NestedLayout from '../../../../components/layout/NestedLayout';
import { useAppearance } from '../../../../hooks/useAppearance';
import { TaskBoard } from '../../../../types/primitives/TaskBoard';

const OrgBoardsPage = () => {
  const router = useRouter();
  const { orgId } = router.query;

  const { data, error } = useSWR(`/api/orgs/${orgId}`);
  const isLoading = !data && !error;

  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(
      data?.id
        ? [
            {
              content: data?.name,
              href: `/orgs/${data.id}`,
            },
            {
              content: 'Boards',
              href: `/orgs/${data.id}/boards`,
            },
          ]
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.name]);

  if (isLoading) return <div>Loading...</div>;

  const createBoard = async (orgId: string, board: TaskBoard) => {
    const res = await fetch(`/api/orgs/${orgId}/boards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(board),
    });

    if (res.status === 200) {
      mutate(`/api/orgs/${orgId}/boards`);
      showNotification({
        title: 'Board created',
        color: 'teal',
        message: `Board ${board.name} created successfully`,
      });
    } else {
      showNotification({
        title: 'Error',
        color: 'red',
        message: `Board ${board.name} could not be created`,
      });
    }
  };

  const showBoardEditForm = () => {
    if (!orgId) return;
    openModal({
      title: <div className="font-semibold">Create new board</div>,
      centered: true,
      children: (
        <BoardEditForm orgId={orgId as string} onSubmit={createBoard} />
      ),
    });
  };

  return (
    <div className="grid gap-4">
      {orgId && (
        <div className="flex justify-between items-center mt-2 mb-2">
          <h1 className="font-bold text-lg md:text-xl lg:text-2xl xl:text-3xl">
            Boards
          </h1>
          <button
            onClick={showBoardEditForm}
            className="px-4 py-2 font-semibold rounded flex gap-1 bg-blue-300/20 text-blue-300 hover:bg-blue-300/10 transition"
          >
            New board <PlusIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

OrgBoardsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout>{page}</NestedLayout>;
};

export default OrgBoardsPage;
