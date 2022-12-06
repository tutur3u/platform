import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../components/layout/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';
import { useUserList } from '../../../hooks/useUserList';

const OrganizationOverviewPage = () => {
  const router = useRouter();
  const { updateUsers } = useUserList();

  const { orgId } = router.query;

  const { data, error } = useSWR(`/api/orgs/${orgId}`);

  const { data: membersData } = useSWR(
    orgId ? `/api/orgs/${orgId}/members` : null
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
            displayName: m.display_name,
            email: m.email,
            username: m.username,
            avatarUrl: m.avatar_url,
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
          content: data?.name,
          href: `/orgs/${data?.id}`,
        },
        {
          content: 'Overview',
          href: `/orgs/${data?.id}`,
        },
      ],
      [data?.id]
    );

    changeLeftSidebarSecondaryPref('hidden');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.name]);

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="grid gap-4">
      <h1 className="font-bold">Overview</h1>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="h-72 rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
          <h1 className="font-bold">Revenue</h1>
        </div>
        <div className="h-72 rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
          <h1 className="font-bold">Expenses</h1>
        </div>
        <div className="h-72 rounded-lg border border-zinc-800/80 bg-[#19191d] p-4 max-xl:col-span-full">
          <h1 className="font-bold">Recent Activity</h1>
        </div>
      </div>
    </div>
  );
};

OrganizationOverviewPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout>{page}</NestedLayout>;
};

export default OrganizationOverviewPage;
