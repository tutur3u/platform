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

  useEffect(
    () => {
      setRootSegment(
        data?.name
          ? [
              {
                content: data.name,
                href: `/orgs/${data.id}`,
              },
              {
                content: 'Teams',
                href: `/orgs/${data.id}/teams`,
              },
            ]
          : []
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data?.name]
  );

  if (isLoading) return <div>Loading...</div>;

  return (
    <>
      <h1 className="font-bold">Teams</h1>

      <div></div>
    </>
  );
};

OrganizationTeamsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout>{page}</NestedLayout>;
};

export default OrganizationTeamsPage;
