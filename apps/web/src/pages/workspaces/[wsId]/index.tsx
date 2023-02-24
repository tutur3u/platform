import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';
import { useUserList } from '../../../hooks/useUserList';
import HeaderX from '../../../components/metadata/HeaderX';
import { Divider } from '@mantine/core';

const WorkspaceOverviewPage = () => {
  const router = useRouter();
  const { updateUsers } = useUserList();

  const { wsId } = router.query;

  const { data, error } = useSWR(wsId ? `/api/workspaces/${wsId}` : null);

  const { data: membersData } = useSWR(
    wsId ? `/api/workspaces/${wsId}/members` : null
  );

  useEffect(() => {
    if (membersData)
      updateUsers(
        membersData?.members?.map(
          (m: {
            id: string;
            display_name: string;
            email: string;
            username: string;
            avatar_url: string;
          }) => ({
            id: m.id,
            display_name: m.display_name,
            email: m.email,
            username: m.username,
            avatar_url: m.avatar_url,
          })
        ) || []
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membersData]);

  const isLoading = !data && !error;

  const { setRootSegment, changeLeftSidebarSecondaryPref } = useAppearance();

  useEffect(() => {
    setRootSegment(
      [
        {
          content: data?.name ?? 'Loading...',
          href: `/workspaces/${data?.id}`,
        },
        {
          content: 'Overview',
          href: `/workspaces/${data?.id}`,
        },
      ],
      [data?.id]
    );

    changeLeftSidebarSecondaryPref('hidden');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.name]);

  if (isLoading) return <div>Loading...</div>;

  return (
    <>
      <HeaderX label={`Overview – ${data?.name || 'Unnamed Workspace'}`} />

      {wsId && (
        <>
          <div className="rounded-lg bg-zinc-900 p-4">
            <h1 className="text-2xl font-bold">Overview</h1>
            <p className="text-zinc-400">
              A quick summary of the{' '}
              <span className="font-semibold text-zinc-200">
                {data?.name || 'Unnamed Workspace'}
              </span>{' '}
              workspace and its progress.
            </p>
          </div>
        </>
      )}

      <Divider className="my-4" />
    </>
  );
};

WorkspaceOverviewPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout>{page}</NestedLayout>;
};

export default WorkspaceOverviewPage;
