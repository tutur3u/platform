import { PlusIcon } from '@heroicons/react/24/solid';
import { useRouter } from 'next/router';
import React, { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { useAppearance } from '../../../../hooks/useAppearance';

const OrgBoardsPage = () => {
  const router = useRouter();
  const { orgId } = router.query;

  const { data, error } = useSWR(`/api/orgs/${orgId}`);
  const isLoading = !data && !error;

  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(
      orgId
        ? [
            {
              content: data?.name,
              href: `/orgs/${orgId}`,
            },
            {
              content: 'Boards',
              href: `/orgs/${orgId}/boards`,
            },
          ]
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, data?.name]);

  if (isLoading) return <div>Loading...</div>;

  // const createBoard = async (orgId: string, board: TaskBoard) => {
  //   const res = await fetch(`/api/orgs/${orgId}/boards`, {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/json',
  //     },
  //     body: JSON.stringify(board),
  //   });

  //   if (res.status === 200) {
  //     mutate(`/api/orgs/${orgId}/boards`);
  //     showNotification({
  //       title: 'Board created',
  //       color: 'teal',
  //       message: `Board ${board.name} created successfully`,
  //     });
  //   } else {
  //     showNotification({
  //       title: 'Error',
  //       color: 'red',
  //       message: `Board ${board.name} could not be created`,
  //     });
  //   }
  // };

  // const showBoardEditForm = () => {
  //   if (!orgId) return;
  //   openModal({
  //     title: <div className="font-semibold">Create new board</div>,
  //     centered: true,
  //     children: (
  //       <BoardEditForm orgId={orgId as string} onSubmit={createBoard} />
  //     ),
  //   });
  // };

  return (
    <div className="grid gap-4">
      {orgId && (
        <div className="mt-2 mb-2 flex items-center justify-between">
          <h1 className="text-lg font-bold md:text-xl lg:text-2xl xl:text-3xl">
            Boards
          </h1>
          <button
            // onClick={showBoardEditForm}
            className="flex items-center gap-1 rounded bg-blue-300/20 px-4 py-2 font-semibold text-blue-300 transition hover:bg-blue-300/10"
          >
            New board <PlusIcon className="h-4 w-4" />
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
