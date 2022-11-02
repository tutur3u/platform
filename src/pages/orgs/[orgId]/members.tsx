import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../components/layout/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';

const OrganizationMembersPage = () => {
  const router = useRouter();
  const { orgId } = router.query;

  const { data: orgData, error: orgError } = useSWR(`/api/orgs/${orgId}`);
  const { data: membersData, error: membersError } = useSWR(
    orgData ? `/api/orgs/${orgId}/members` : null
  );

  const isLoadingOrg = !orgData && !orgError;
  const isLoadingMembers = !membersData && !membersError;

  const isLoading = isLoadingOrg || isLoadingMembers;

  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(
      orgData?.name
        ? [
            {
              content: orgData.name,

              href: `/orgs/${orgData.id}`,
            },
            {
              content: 'Members',
              href: `/orgs/${orgData.id}/members`,
            },
          ]
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgData?.name]);

  if (isLoading) return <div>Loading...</div>;

  return (
    <>
      <h1 className="font-bold">Members</h1>

      <div></div>
    </>
  );
};

OrganizationMembersPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout>{page}</NestedLayout>;
};

export default OrganizationMembersPage;
