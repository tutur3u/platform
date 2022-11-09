import { PlusIcon } from '@heroicons/react/24/solid';
import { useRouter } from 'next/router';
import React, { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../../components/layout/NestedLayout';
import { useAppearance } from '../../../../hooks/useAppearance';

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

  return (
    <div className="grid gap-4">
      {orgId && (
        <div className="flex justify-between items-center mt-2 mb-2">
          <h1 className="font-bold text-lg md:text-xl lg:text-2xl xl:text-3xl">
            Boards
          </h1>
          <button
            // onClick={showProjectEditForm}
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
