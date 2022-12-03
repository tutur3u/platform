import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../components/layout/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';

const OrganizationOverviewPage = () => {
  const router = useRouter();
  const { orgId } = router.query;

  const { data, error } = useSWR(`/api/orgs/${orgId}`);
  const isLoading = !data && !error;

  const { setRootSegment, changeRightSidebar } = useAppearance();

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

    changeRightSidebar('closed');
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
