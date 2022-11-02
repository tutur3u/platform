import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../components/layout/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';

const OrganizationTeamsPage = () => {
  const router = useRouter();
  const { orgId } = router.query;

  const { data, error } = useSWR(`/api/orgs/${orgId}`);
  const isLoading = !data && !error;

  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(data?.name ? [data.name, 'Teams'] : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.name]);

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="grid gap-4">
      <div className="p-4 bg-zinc-900 rounded-lg">
        <h1 className="font-bold">Teams</h1>
        <p className="text-zinc-400">
          This is the teams page for the {data?.name} organization.
        </p>
      </div>
    </div>
  );
};

OrganizationTeamsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout>{page}</NestedLayout>;
};

export default OrganizationTeamsPage;
