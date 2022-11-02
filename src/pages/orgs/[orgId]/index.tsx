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

  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(
      data?.name
        ? [
            {
              content: data.name,
              href: `/orgs/${data.id}`,
            },
            {
              content: 'Overview',
              href: `/orgs/${data.id}`,
            },
          ]
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.name]);

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="grid gap-4">
      <h1 className="font-bold">Overview</h1>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="p-4 bg-zinc-900 rounded-lg h-72">
          <h1 className="font-bold">Revenue</h1>
        </div>
        <div className="p-4 bg-zinc-900 rounded-lg h-72">
          <h1 className="font-bold">Expenses</h1>
        </div>
        <div className="p-4 bg-zinc-900 rounded-lg h-72 max-xl:col-span-full">
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
