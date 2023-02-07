import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';
import { useUserList } from '../../../hooks/useUserList';
import HeaderX from '../../../components/metadata/HeaderX';

const OrganizationOverviewPage = () => {
  const router = useRouter();
  const { updateUsers } = useUserList();

  const { orgId } = router.query;

  const { data, error } = useSWR(orgId ? `/api/orgs/${orgId}` : null);

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
    <>
      <HeaderX
        label={`Overview – ${data?.name || 'Unnamed Organization'}`}
        disableBranding
      />

      <div className="grid gap-4">
        <h1 className="font-bold">Overview</h1>

        <div className="rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
          <p className="text-zinc-400">
            This is the overview page for the{' '}
            <span className="font-semibold text-white">
              {data?.name || 'Unnamed Organization'}
            </span>{' '}
            workspace.
          </p>
        </div>
      </div>
    </>
  );
};

OrganizationOverviewPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout>{page}</NestedLayout>;
};

export default OrganizationOverviewPage;
